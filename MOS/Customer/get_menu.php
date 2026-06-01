<?php

  // データベース接続情報
    $host = 'localhost';
    $dbname = 'mos';
    $username = 'Customer';
    $password = 'Cust@999-00';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // 削除フラグが1の行を除外する（カラムが存在しない場合に備えて COALESCE を使用）
    $stmt = $pdo->query("SELECT * FROM `menu_list` WHERE COALESCE(`削除フラグ`, 0) = 0 ORDER BY id ASC");
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
            'soldOut' => isset($row['品切れフラグ']) ? (bool)$row['品切れフラグ'] : false,
            // 削除フラグを追加（存在しない場合は0）
            'deleted' => isset($row['削除フラグ']) ? ((int)$row['削除フラグ'] === 1 ? 1 : 0) : 0
        ];
    }

    echo json_encode($items, JSON_UNESCAPED_UNICODE);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
}
