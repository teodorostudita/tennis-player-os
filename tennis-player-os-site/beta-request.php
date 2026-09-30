<?php
declare(strict_types=1);

ini_set('display_errors', '0');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$wantsJson = stripos($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json') !== false;

function respond(bool $ok, int $status, string $message, bool $json = true, ?string $code = null): void {
    http_response_code($status);
    if ($json) {
        header('Content-Type: application/json; charset=UTF-8');
        $payload = $ok ? ['ok' => true, 'message' => $message] : ['ok' => false, 'error' => $message];
        if ($code !== null) {
            $payload['code'] = $code;
        }
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    } else {
        header('Content-Type: text/html; charset=UTF-8');
        $title = $ok ? 'Richiesta inviata' : 'Invio non riuscito';
        $safe = htmlspecialchars($message, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        echo '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
           . '<title>' . $title . '</title></head><body style="font-family:system-ui;padding:40px;max-width:720px;margin:auto">'
           . '<h1>' . $title . '</h1><p>' . $safe . '</p><p><a href="./#beta">Torna a Tennis Player OS</a></p></body></html>';
    }
    exit;
}

function foundingBetaStatus(): ?array {
    $url = 'https://jgonjgxtshupvpqflzpe.supabase.co/rest/v1/rpc/get_founding_beta_status';
    $key = 'sb_publishable_-Xz5LAaeK7XYcjyUCzt6VQ_Ud9wmV4S';

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => implode("\r\n", [
                'Content-Type: application/json',
                'Accept: application/json',
                'apikey: ' . $key,
                'Authorization: Bearer ' . $key,
            ]),
            'content' => '{}',
            'timeout' => 8,
            'ignore_errors' => true,
        ],
    ]);

    $response = @file_get_contents($url, false, $context);
    if ($response === false || trim($response) === '') {
        return null;
    }

    $data = json_decode($response, true);
    if (!is_array($data) || !isset($data['capacity'])) {
        return null;
    }

    $capacity = max(0, (int)($data['capacity'] ?? 30));
    $active = max(0, (int)($data['active'] ?? 0));
    $remaining = max(0, (int)($data['remaining'] ?? max(0, $capacity - $active)));

    return [
        'capacity' => $capacity,
        'active' => $active,
        'remaining' => $remaining,
        'full' => (bool)($data['full'] ?? ($remaining <= 0)),
    ];
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

function smtpSend(array $cfg, string $replyTo, string $subject, string $body): void {
    $host = (string)($cfg['host'] ?? '');
    $port = (int)($cfg['port'] ?? 587);
    $username = (string)($cfg['username'] ?? '');
    $password = (string)($cfg['password'] ?? '');
    $fromEmail = (string)($cfg['from_email'] ?? $username);
    $fromName = (string)($cfg['from_name'] ?? 'Tennis Player OS');
    $toEmail = (string)($cfg['to_email'] ?? '');
    $toName = (string)($cfg['to_name'] ?? '');
    $timeout = (int)($cfg['timeout'] ?? 15);

    if ($host === '' || $username === '' || $password === '' || $toEmail === '') {
        throw new RuntimeException('Configurazione SMTP incompleta.');
    }

    $errno = 0;
    $errstr = '';
    $fp = @stream_socket_client('tcp://' . $host . ':' . $port, $errno, $errstr, $timeout, STREAM_CLIENT_CONNECT);
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
            'Reply-To: ' . $replyTo,
            'Subject: ' . $encodedSubject,
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $messageIdDomain . '>',
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 8bit',
            'X-Mailer: Tennis Player OS Website',
        ];

        $safeBody = preg_replace('/(?m)^\./', '..', str_replace(["\r\n", "\r"], "\n", $body));
        $data = implode("\r\n", $headers) . "\r\n\r\n" . str_replace("\n", "\r\n", $safeBody) . "\r\n.";
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
    respond(false, 405, 'Metodo non consentito.', $wantsJson, 'method_not_allowed');
}

// Honeypot: bots tend to fill invisible fields. Return success silently.
if (trim((string)($_POST['company'] ?? '')) !== '') {
    respond(true, 200, 'Richiesta ricevuta.', $wantsJson);
}

// Lightweight rate limit.
$ip = (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown');
$rateFile = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'tpos_beta_' . hash('sha256', $ip) . '.rate';
$now = time();
if (is_file($rateFile)) {
    $last = (int)@file_get_contents($rateFile);
    if ($last > 0 && ($now - $last) < 20) {
        respond(false, 429, 'Attendi qualche secondo prima di inviare una nuova richiesta.', $wantsJson, 'rate_limited');
    }
}
@file_put_contents($rateFile, (string)$now, LOCK_EX);

$name = trim((string)($_POST['name'] ?? ''));
$email = trim((string)($_POST['email'] ?? ''));
$profile = trim((string)($_POST['profile'] ?? ''));
$message = trim((string)($_POST['message'] ?? ''));
$programState = trim((string)($_POST['program_state'] ?? 'open'));
$lang = trim((string)($_POST['lang'] ?? 'it'));
$name = preg_replace('/[\r\n]+/', ' ', $name) ?? '';
$email = preg_replace('/[\r\n]+/', '', $email) ?? '';
$message = preg_replace('/\r\n?/', "\n", $message) ?? '';

$nameLength = function_exists('mb_strlen') ? mb_strlen($name, 'UTF-8') : strlen($name);
if ($name === '' || $nameLength < 2 || $nameLength > 100) {
    respond(false, 422, 'Nome non valido.', $wantsJson, 'invalid_name');
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
    respond(false, 422, 'Email non valida.', $wantsJson, 'invalid_email');
}

$profiles = [
    'parent' => 'Genitore / famiglia',
    'player' => 'Atleta',
    'coach' => 'Coach',
    'academy' => 'Academy / Club',
    'other' => 'Altro',
];
if ($profile !== '' && !isset($profiles[$profile])) {
    respond(false, 422, 'Profilo di interesse non valido.', $wantsJson, 'invalid_profile');
}
$messageLength = function_exists('mb_strlen') ? mb_strlen($message, 'UTF-8') : strlen($message);
if ($messageLength > 1200) {
    respond(false, 422, 'Messaggio troppo lungo.', $wantsJson, 'message_too_long');
}
if (!in_array($programState, ['open', 'waitlist'], true)) {
    $programState = 'open';
}

$configFile = __DIR__ . '/mail-config.php';
if (!is_file($configFile)) {
    respond(false, 503, 'Configurazione email non disponibile.', $wantsJson, 'smtp_config_missing');
}
$config = require $configFile;
if (!is_array($config)) {
    respond(false, 503, 'Configurazione email non valida.', $wantsJson, 'smtp_config_invalid');
}
$password = (string)($config['password'] ?? '');
if ($password === '' || $password === 'INCOLLA_QUI_LA_PASSWORD_SPECIFICA_PER_APP') {
    respond(false, 503, 'Configurazione SMTP da completare.', $wantsJson, 'smtp_password_missing');
}

$profileLabel = $profile !== '' ? $profiles[$profile] : 'Non specificato';
$langLabel = strtolower($lang) === 'en' ? 'English' : 'Italiano';
$timestamp = new DateTimeImmutable('now', new DateTimeZone('Europe/Rome'));
$referer = trim((string)($_SERVER['HTTP_REFERER'] ?? '')) ?: 'non disponibile';

$betaStatus = foundingBetaStatus();
$capacity = $betaStatus !== null ? $betaStatus['capacity'] : 30;
$active = $betaStatus !== null ? $betaStatus['active'] : null;
$remaining = $betaStatus !== null ? $betaStatus['remaining'] : null;
$programFull = $betaStatus !== null ? (bool)$betaStatus['full'] : false;

$programLabel = ($programState === 'waitlist' || $programFull || $remaining === 0)
    ? "Lista d'attesa"
    : 'Posto Beta disponibile';

$activeLabel = $active !== null
    ? "{$active} / {$capacity}"
    : 'non disponibile';

$remainingLabel = $remaining !== null
    ? (string)$remaining
    : 'non disponibile';

$subjectPrefix = $programLabel === "Lista d'attesa"
    ? 'Tennis Player OS - Lista d’attesa Founding Beta - '
    : 'Tennis Player OS - Nuova richiesta Founding Beta - ';
$subject = $subjectPrefix . $name;
$body = "Nuova richiesta per la Founding Beta di Tennis Player OS\n"
      . "======================================================\n\n"
      . "Nome: {$name}\n"
      . "Email: {$email}\n"
      . "Profilo di interesse: {$profileLabel}\n"
      . "Tipo di accesso previsto: Founding Beta Owner (accesso completo)\n"
      . "Stato programma: {$programLabel}\n"
      . "Posti attivi: {$activeLabel}\n"
      . "Posti rimanenti: {$remainingLabel}\n"
      . "Lingua sito: {$langLabel}\n"
      . "Data: " . $timestamp->format('d/m/Y H:i:s T') . "\n"
      . "Pagina: {$referer}\n";

if ($message !== '') {
    $body .= "\nMessaggio / richiesta iniziale:\n{$message}\n";
}

$body .= "\nRispondi direttamente a questa email: il Reply-To è impostato su {$email}.\n";

try {
    smtpSend($config, $email, $subject, $body);
} catch (Throwable $e) {
    error_log('[TPOS Beta SMTP] ' . $e->getMessage());
    respond(false, 502, 'Il server non è riuscito a spedire la mail via SMTP.', $wantsJson, 'smtp_send_failed');
}

respond(true, 200, 'Richiesta inviata correttamente.', $wantsJson);
