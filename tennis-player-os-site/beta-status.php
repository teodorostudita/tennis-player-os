<?php
declare(strict_types=1);

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$configFile = __DIR__ . '/beta-program.php';
if (!is_file($configFile)) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'Beta status unavailable']);
    exit;
}

$config = require $configFile;
$capacity = max(0, (int)($config['capacity'] ?? 30));
$active = max(0, (int)($config['active'] ?? 0));
$remaining = max(0, $capacity - $active);

echo json_encode([
    'ok' => true,
    'capacity' => $capacity,
    'active' => min($active, $capacity),
    'remaining' => $remaining,
    'full' => $remaining <= 0,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
