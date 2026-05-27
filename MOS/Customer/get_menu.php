<?php
header('Content-Type: application/json; charset=utf-8');

$host = 'localhost';
$dbname = 'mos';
$username = 'null';
$password = 'null';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $stmt = $pdo->query("SELECT * FROM `menu_list` WHERE 1 ORDER BY id ASC");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $items = [];
    foreach ($rows as $row) {
        // DBのカラム名に合わせてマッピング
        $items[] = [
            'id' => isset($row['id']) ? (string)$row['id'] : null,
            'name' => isset($row['商品名']) ? $row['商品名'] : (isset($row['name']) ? $row['name'] : ''),
            'category' => isset($row['カテゴリ']) ? $row['カテゴリ'] : '',
            'price' => isset($row['価格']) ? (int)$row['価格'] : (isset($row['price']) ? (int)$row['price'] : 0),
            'image' => isset($row['画像']) ? $row['画像'] : '',
            'popular' => false,
            'soldOut' => isset($row['品切れフラグ']) ? (bool)$row['品切れフラグ'] : false
        ];
    }

    echo json_encode($items, JSON_UNESCAPED_UNICODE);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
