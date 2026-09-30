<?php
declare(strict_types=1);

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

const SUPABASE_URL = 'https://jgonjgxtshupvpqflzpe.supabase.co';
const SUPABASE_PUBLIC_KEY = 'sb_publishable_-Xz5LAaeK7XYcjyUCzt6VQ_Ud9wmV4S';
const APP_URL = 'https://tennis.polidorionline.it/';
const EXPECTED_INVITE_HOST = 'jgonjgxtshupvpqflzpe.supabase.co';

function respond(bool $ok, int $status, string $message): void {
    http_response_code($status);
    echo json_encode(
        $ok ? ['ok' => true, 'message' => $message] : ['ok' => false, 'error' => $message],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
}

function authorizationHeader(): string {
    $value = trim((string)($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
    if ($value === '' && function_exists('getallheaders')) {
        $headers = getallheaders();
        foreach ($headers as $name => $headerValue) {
            if (strcasecmp((string)$name, 'Authorization') === 0) {
                $value = trim((string)$headerValue);
                break;
            }
        }
    }
    return $value;
}

function httpStatusFromHeaders(array $headers): int {
    foreach (array_reverse($headers) as $line) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})\b/i', (string)$line, $m)) {
            return (int)$m[1];
        }
    }
    return 0;
}

function verifyGlobalOwner(string $authorization): bool {
    if (strncmp($authorization, 'Bearer ', 7) !== 0) {
        return false;
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => implode("\r\n", [
                'Content-Type: application/json',
                'Accept: application/json',
                'apikey: ' . SUPABASE_PUBLIC_KEY,
                'Authorization: ' . $authorization,
            ]),
            'content' => '{}',
            'timeout' => 10,
            'ignore_errors' => true,
        ],
    ]);

    $response = @file_get_contents(
        SUPABASE_URL . '/rest/v1/rpc/is_app_owner',
        false,
        $context
    );

    $status = httpStatusFromHeaders($http_response_header ?? []);
    if ($response === false || $status < 200 || $status >= 300) {
        return false;
    }

    return json_decode($response, true) === true;
}

function smtpRead($fp): array {
    $lines = [];
    $code = 0;
    while (($line = fgets($fp, 8192)) !== false) {
        $lines[] = rtrim($line, "\r\n");
        if (preg_match('/^(\d{3})([ -])/', $line, $m)) {
            $code = (int)$m[1];
            if ($m[2] === ' ') {
                break;
            }
        } else {
            break;
        }
    }
    return [$code, implode("\n", $lines)];
}

function smtpCommand($fp, string $command, array $expected): array {
    if (fwrite($fp, $command . "\r\n") === false) {
        throw new RuntimeException('Impossibile scrivere sul socket SMTP.');
    }
    [$code, $reply] = smtpRead($fp);
    if (!in_array($code, $expected, true)) {
        throw new RuntimeException('SMTP ' . $code . ': ' . $reply);
    }
    return [$code, $reply];
}

function smtpSend(array $cfg, string $toEmail, string $toName, string $subject, string $body): void {
    $host = (string)($cfg['host'] ?? '');
    $port = (int)($cfg['port'] ?? 587);
    $username = (string)($cfg['username'] ?? '');
    $password = (string)($cfg['password'] ?? '');
    $fromEmail = (string)($cfg['from_email'] ?? $username);
    $fromName = (string)($cfg['from_name'] ?? 'Tennis Player OS');
    $timeout = (int)($cfg['timeout'] ?? 15);

    if ($host === '' || $username === '' || $password === '' || $fromEmail === '' || $toEmail === '') {
        throw new RuntimeException('Configurazione SMTP incompleta.');
    }

    $errno = 0;
    $errstr = '';
    $fp = @stream_socket_client(
        'tcp://' . $host . ':' . $port,
        $errno,
        $errstr,
        $timeout,
        STREAM_CLIENT_CONNECT
    );

    if (!$fp) {
        throw new RuntimeException('Connessione SMTP non riuscita: ' . $errstr . ' (' . $errno . ')');
    }

    stream_set_timeout($fp, $timeout);

    try {
        [$code] = smtpRead($fp);
        if ($code !== 220) {
            throw new RuntimeException('Il server SMTP non ha risposto correttamente all’apertura della connessione.');
        }

        $helo = preg_replace('/[^A-Za-z0-9.-]/', '', (string)($_SERVER['SERVER_NAME'] ?? 'polidorionline.it')) ?: 'polidorionline.it';
        smtpCommand($fp, 'EHLO ' . $helo, [250]);
        smtpCommand($fp, 'STARTTLS', [220]);

        $cryptoOk = @stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
        if ($cryptoOk !== true) {
            throw new RuntimeException('Impossibile attivare TLS sulla connessione SMTP.');
        }

        smtpCommand($fp, 'EHLO ' . $helo, [250]);
        smtpCommand($fp, 'AUTH LOGIN', [334]);
        smtpCommand($fp, base64_encode($username), [334]);
        smtpCommand($fp, base64_encode($password), [235]);
        smtpCommand($fp, 'MAIL FROM:<' . $fromEmail . '>', [250]);
        smtpCommand($fp, 'RCPT TO:<' . $toEmail . '>', [250, 251]);
        smtpCommand($fp, 'DATA', [354]);

        $encodedFromName = '=?UTF-8?B?' . base64_encode($fromName) . '?=';
        $encodedToName = $toName !== '' ? '=?UTF-8?B?' . base64_encode($toName) . '?= ' : '';
        $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        $messageIdDomain = preg_replace('/^www\./i', '', (string)($_SERVER['SERVER_NAME'] ?? 'polidorionline.it')) ?: 'polidorionline.it';

        $headers = [
            'Date: ' . date(DATE_RFC2822),
            'From: ' . $encodedFromName . ' <' . $fromEmail . '>',
            'To: ' . $encodedToName . '<' . $toEmail . '>',
            'Subject: ' . $encodedSubject,
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $messageIdDomain . '>',
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            'X-Mailer: Tennis Player OS Website',
        ];

        $safeBody = preg_replace('/(?m)^\./', '..', str_replace(["\r\n", "\r"], "\n", $body));
        $data = implode("\r\n", $headers)
            . "\r\n\r\n"
            . str_replace("\n", "\r\n", $safeBody)
            . "\r\n.";

        if (fwrite($fp, $data . "\r\n") === false) {
            throw new RuntimeException('Invio del contenuto SMTP non riuscito.');
        }

        [$dataCode, $dataReply] = smtpRead($fp);
        if ($dataCode !== 250) {
            throw new RuntimeException('Il server SMTP ha rifiutato il messaggio: ' . $dataReply);
        }

        @smtpCommand($fp, 'QUIT', [221]);
    } finally {
        fclose($fp);
    }
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(false, 405, 'Metodo non consentito.');
}

$authorization = authorizationHeader();
if (!verifyGlobalOwner($authorization)) {
    respond(false, 403, 'Richiesta non autorizzata.');
}

$raw = file_get_contents('php://input');
$data = json_decode($raw !== false ? $raw : '', true);
if (!is_array($data)) {
    respond(false, 400, 'Payload non valido.');
}

$email = trim((string)($data['email'] ?? ''));
$displayName = trim((string)($data['displayName'] ?? ''));
$inviteUrl = trim((string)($data['inviteUrl'] ?? ''));
$existingAccount = (bool)($data['existingAccount'] ?? false);

$email = preg_replace('/[\r\n]+/', '', $email) ?? '';
$displayName = preg_replace('/[\r\n]+/', ' ', $displayName) ?? '';

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
    respond(false, 422, 'Indirizzo email destinatario non valido.');
}

if (!$existingAccount) {
    if (!filter_var($inviteUrl, FILTER_VALIDATE_URL)) {
        respond(false, 422, 'Link di attivazione non valido.');
    }

    $inviteHost = strtolower((string)parse_url($inviteUrl, PHP_URL_HOST));
    if ($inviteHost !== EXPECTED_INVITE_HOST) {
        respond(false, 422, 'Host del link di attivazione non autorizzato.');
    }
}

$configFile = __DIR__ . '/mail-config.php';
if (!is_file($configFile)) {
    respond(false, 503, 'Configurazione email non disponibile.');
}

$config = require $configFile;
if (!is_array($config)) {
    respond(false, 503, 'Configurazione email non valida.');
}

$password = (string)($config['password'] ?? '');
if ($password === '' || $password === 'INCOLLA_QUI_LA_PASSWORD_SPECIFICA_PER_APP') {
    respond(false, 503, 'Configurazione SMTP da completare.');
}

$hello = $displayName !== '' ? 'Ciao ' . $displayName . ',' : 'Ciao,';

if ($existingAccount) {
    $subject = 'Tennis Player OS — Accesso Founding Beta attivato';
    $body = $hello . "\n\n"
        . "il tuo account Tennis Player OS è stato abilitato alla Founding Beta.\n\n"
        . "Puoi accedere con le credenziali che usi già qui:\n"
        . APP_URL . "\n\n"
        . "Il tuo workspace è separato e hai accesso completo alle funzioni previste per i Beta Owner.\n\n"
        . "A presto,\nTennis Player OS\n";
} else {
    $subject = 'Tennis Player OS — Attiva il tuo account Founding Beta';
    $body = $hello . "\n\n"
        . "il tuo account Tennis Player OS Founding Beta è pronto.\n\n"
        . "Apri il link personale qui sotto per attivare l’account e scegliere la tua password:\n\n"
        . $inviteUrl . "\n\n"
        . "Dopo l’attivazione potrai accedere normalmente da:\n"
        . APP_URL . "\n\n"
        . "Il link di attivazione è personale e può scadere; se non funziona più, chiedi un nuovo invito.\n\n"
        . "A presto,\nTennis Player OS\n";
}

try {
    smtpSend($config, $email, $displayName, $subject, $body);
} catch (Throwable $e) {
    error_log('[TPOS Beta Owner SMTP] ' . $e->getMessage());
    respond(false, 502, 'Il server TPOS non è riuscito a spedire la mail di attivazione.');
}

respond(true, 200, 'Email Founding Beta inviata correttamente.');
