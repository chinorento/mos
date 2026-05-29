<?php

$host = 'localhost';
$dbname = 'mos';
$username = 'null';
$password = 'null';

header('Content-Type: application/json; charset=utf-8');

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $stmt = $pdo->prepare("SELECT `id`, `席番`, `日時`, `完了フラグ` FROM `staffcall_list` WHERE `完了フラグ` = 0 ORDER BY `日時` DESC, `id` DESC");
    $stmt->execute();

    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $calls = array_map(static function(array $row) {
        return [
            'id' => $row['id'] ?? null,
            'seatId' => $row['席番'] ?? null,
            'status' => ((string)($row['完了フラグ'] ?? '0') === '0') ? 'pending' : 'completed',
            'createdAt' => $row['日時'] ?? null,
            'type' => 'staff_request',
            'reason' => 'スタッフ呼び出し',
        ];
    }, $rows);

    echo json_encode($calls, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'データベース接続エラー: ' . $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
