<?php

// データベース接続情報
$host = 'localhost';
$dbname = 'mos';
$username = 'null';
$password = 'null';

header('Content-Type: application/json; charset=utf-8');

try {
    // データベース接続
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // 合計金額を取得
    $stmt = $pdo->prepare("SELECT SUM(`金額`) AS total FROM `order_history` WHERE `配膳フラグ` = 1 AND `削除フラグ` = 0");
    $stmt->execute();
    $result = $stmt->fetch(PDO::FETCH_ASSOC);

    // 合計金額を JSON で返す
    echo json_encode(['total' => (float) $result['total']]);
} catch (PDOException $e) {
    // エラー時のレスポンス
    http_response_code(500);
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
}

?>