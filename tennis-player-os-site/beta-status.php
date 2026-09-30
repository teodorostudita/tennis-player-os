<?php
declare(strict_types=1);

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$url = 'https://jgonjgxtshupvpqflzpe.supabase.co/rest/v1/rpc/get_founding_beta_status';
$key = 'sb_publishable_-Xz5LAaeK7XYcjyUCzt6VQ_Ud9wmV4S';

$context = stream_context_create([
    'http' => [
        'method' => 'POST',
        'header' => implode("\r\n", [
            'Content-Type: application/json',
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
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'Beta status unavailable']);
    exit;
}

$data = json_decode($response, true);
if (!is_array($data) || !isset($data['capacity'])) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'Invalid beta status response']);
    exit;
}

echo json_encode([
    'ok' => true,
    'capacity' => (int)($data['capacity'] ?? 30),
    'active' => (int)($data['active'] ?? 0),
    'remaining' => (int)($data['remaining'] ?? 0),
    'full' => (bool)($data['full'] ?? false),
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
