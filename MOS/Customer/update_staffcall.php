<?php

$host = 'localhost';
$dbname = 'mos';
$username = 'null';
$password = 'null';

header('Content-Type: application/json; charset=utf-8');

function request_value(string $key, $default = null) {
    if (isset($_POST[$key])) {
        return $_POST[$key];
    }

    $raw = file_get_contents('php://input');
    if ($raw !== false && $raw !== '') {
        $json = json_decode($raw, true);
        if (is_array($json) && array_key_exists($key, $json)) {
            return $json[$key];
        }
    }

    return $default;
}

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $id = trim((string) request_value('id', ''));
    $completeFlag = (int) request_value('complete_flag', request_value('完了フラグ', 1));

    if ($id === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'idが未指定です'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $stmt = $pdo->prepare("UPDATE `staffcall_list` SET `完了フラグ` = :complete_flag WHERE `id` = :id");
    $stmt->execute([
        ':complete_flag' => $completeFlag,
        ':id' => $id,
    ]);

    echo json_encode([
        'success' => true,
        'message' => 'スタッフ呼び出しを更新しました',
        'id' => $id,
        'completeFlag' => $completeFlag,
    ], JSON_UNESCAPED_UNICODE);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'データベース接続エラー: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
