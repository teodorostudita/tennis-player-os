<?php
declare(strict_types=1);

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

const TPOS_SUPABASE_BETA_STATUS_URL = 'https://jgonjgxtshupvpqflzpe.supabase.co/rest/v1/rpc/get_founding_beta_status';
const TPOS_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_-Xz5LAaeK7XYcjyUCzt6VQ_Ud9wmV4S';

function fetchFoundingBetaStatus(): array
{
    $headers = [
        'Accept: application/json',
        'Content-Type: application/json',
        'apikey: ' . TPOS_SUPABASE_PUBLISHABLE_KEY,
    ];

    $body = '';
    $status = 0;
    $error = '';

    if (function_exists('curl_init')) {
        $ch = curl_init(TPOS_SUPABASE_BETA_STATUS_URL);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => '{}',
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_FOLLOWLOCATION => false,
        ]);

        $raw = curl_exec($ch);
        if ($raw === false) {
            $error = 'cURL: ' . curl_error($ch);
        } else {
            $body = (string)$raw;
        }
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
    } else {
        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => implode("\r\n", $headers),
                'content' => '{}',
                'timeout' => 8,
                'ignore_errors' => true,
            ],
        ]);

        $raw = @file_get_contents(TPOS_SUPABASE_BETA_STATUS_URL, false, $context);
        if ($raw === false) {
            $error = 'stream request failed';
        } else {
            $body = (string)$raw;
        }

        foreach (($http_response_header ?? []) as $line) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#i', $line, $m)) {
                $status = (int)$m[1];
                break;
            }
        }
    }

    if ($status < 200 || $status >= 300 || trim($body) === '') {
        throw new RuntimeException('Supabase beta status HTTP ' . $status . ($error !== '' ? ' - ' . $error : ''));
    }

    $data = json_decode($body, true);
    if (!is_array($data) || !array_key_exists('capacity', $data)) {
        throw new RuntimeException('Invalid Supabase beta status payload');
    }

    $capacity = max(0, (int)($data['capacity'] ?? 30));
    $active = max(0, (int)($data['active'] ?? 0));
    $remaining = max(0, (int)($data['remaining'] ?? max(0, $capacity - $active)));

    return [
        'ok' => true,
        'capacity' => $capacity,
        'active' => $active,
        'remaining' => $remaining,
        'full' => (bool)($data['full'] ?? ($remaining <= 0)),
    ];
}

try {
    echo json_encode(
        fetchFoundingBetaStatus(),
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
} catch (Throwable $e) {
    error_log('[TPOS Beta Status] ' . $e->getMessage());
    http_response_code(503);
    echo json_encode([
        'ok' => false,
        'error' => 'beta_status_unavailable',
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
