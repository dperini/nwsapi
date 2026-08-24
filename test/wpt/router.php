<?php
declare(strict_types=1);

/**
 * Interactive router for WPT tests.
 * This file lives in <nwsapi>/test/wpt/.
 *
 * BROWSER_ROOT is optional. It can be an absolute path or one relative
 * to the nwsapi root. If it is unset, ../wpt is used as before.
 */

function browserRoot(string $nwsapiRoot): string
{
    $configured = getenv('BROWSER_ROOT');
    $candidate = is_string($configured) && trim($configured) !== ''
        ? trim($configured)
        : dirname($nwsapiRoot) . DIRECTORY_SEPARATOR . 'wpt';

    // Relative paths are deliberately relative to the nwsapi root.
    if (!str_starts_with($candidate, DIRECTORY_SEPARATOR)) {
        $candidate = $nwsapiRoot . DIRECTORY_SEPARATOR . $candidate;
    }

    $resolved = realpath($candidate);
    if ($resolved === false || !is_dir($resolved)) {
        http_response_code(500);
        header('Content-Type: text/plain; charset=UTF-8');
        exit("BROWSER_ROOT is not a readable directory leggibile: {$candidate}\n");
    }

    return $resolved;
}

$nwsapiRoot = dirname(__DIR__, 2);
$browserRoot = browserRoot($nwsapiRoot);
$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$decodedPath = rawurldecode($requestPath);

if (!str_starts_with($decodedPath, '/')) {
    $decodedPath = '/' . $decodedPath;
}
$decodedPath = str_replace('\\', '/', $decodedPath);
$relativePath = trim($decodedPath, '/');
$segments = $relativePath === '' ? [] : explode('/', $relativePath);

// Does not expose traversal paths or hidden entries from the document root.
foreach ($segments as $segment) {
    if ($segment === '' || $segment === '.' || $segment === '..' || str_contains($segment, "\0")) {
        http_response_code(400);
        exit('Percorso non valido.');
    }
    if (str_starts_with($segment, '.')) {
        http_response_code(404);
        exit('Risorsa non trovata.');
    }
}

$rootPrefix = $browserRoot . DIRECTORY_SEPARATOR;
$requestedFile = $browserRoot . ($relativePath === '' ? '' : DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath));
$realRequested = realpath($requestedFile);
$isInsideBrowserRoot = $realRequested !== false && ($realRequested === $browserRoot || str_starts_with($realRequested, $rootPrefix));

// A manually entered directory or one reached from a link always shows
// its corresponding tree without redirects: Back/Forward work normally.
if ($isInsideBrowserRoot && is_dir($realRequested)) {
    $_SERVER['WPT_BROWSER_PATH'] = $relativePath;
    require $browserRoot . DIRECTORY_SEPARATOR . 'wpt-browser.php';
    exit;
}

// Let the PHP server handle every file other than the harness.
if (!preg_match('~(?:^|/)resources/testharness\.js$~', $requestPath)) {
    return false;
}

$bundle = [
    $nwsapiRoot . DIRECTORY_SEPARATOR . 'src' . DIRECTORY_SEPARATOR . 'nwsapi.js',
    __DIR__ . DIRECTORY_SEPARATOR . 'wpt-helper.js',
    $browserRoot . DIRECTORY_SEPARATOR . 'resources' . DIRECTORY_SEPARATOR . 'testharness.js',
];

foreach ($bundle as $file) {
    if (!is_file($file) || !is_readable($file)) {
        http_response_code(500);
        header('Content-Type: text/plain; charset=UTF-8');
        echo " WPT Configuration Incomplete: file not readable\n";
        exit;
    }
}

header('Content-Type: application/javascript; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store, max-age=0');

foreach ($bundle as $file) {
    readfile($file);
    echo "\n;\n";
}
exit;
