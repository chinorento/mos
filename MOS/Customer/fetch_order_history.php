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

    // クエリ実行
    $stmt = $pdo->prepare("SELECT `id`, `席番`, `日時`, `注文内容`, `個数, `金額`, `配膳フラグ`, `削除フラグ` 
                            FROM `order_history` WHERE `削除フラグ` = 0 ");
    $stmt->execute();

    // 結果を取得
    $orderHistory = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // JSON形式で出力
    echo json_encode($orderHistory, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
} catch (PDOException $e) {
    // エラー時のレスポンス
    http_response_code(500);
    echo json_encode(['error' => 'データベース接続エラー: ' . $e->getMessage()]);
}

?>