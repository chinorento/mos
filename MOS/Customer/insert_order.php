<?php

  // データベース接続情報
  $host = 'localhost';
  $dbname = 'mos';
  $username = 'Customer';
  $password = 'Cust@999-00';

  try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // POSTデータを取得（新旧キーを受け付け）
    $id = trim((string)($_POST['id'] ?? ('order_' . time())));
    $seatNo = trim((string)($_POST['seat_no'] ?? ($_POST['name'] ?? 'C-01')));
    $orderContent = $_POST['order_content'] ?? ($_POST['data'] ?? '');
    $items_json = $_POST['items_json'] ?? null;
    $amount = isset($_POST['amount']) ? (int)$_POST['amount'] : 0;
    $servedFlag = isset($_POST['served_flag']) ? (int)$_POST['served_flag'] : 0;
    $deletedFlag = isset($_POST['deleted_flag']) ? (int)$_POST['deleted_flag'] : 0;

    // サーバー時刻（日本）
    $now = new DateTime('now', new DateTimeZone('Asia/Tokyo'));
    $datetime = $now->format('Y-m-d H:i:s');

    $items = [];

    // まず構造化された items_json を優先して受け取る（フロントにて送信済みの場合）
    if ($items_json) {
      $decoded = json_decode($items_json, true);
      if (is_array($decoded)) {
        foreach ($decoded as $it) {
          $name = isset($it['name']) ? trim((string)$it['name']) : '';
          $qty = isset($it['qty']) ? max(1, (int)$it['qty']) : 1;
          $unitPrice = (isset($it['unitPrice']) && $it['unitPrice'] !== '') ? (int)$it['unitPrice'] : null;
          if ($name === '') {
            continue;
          }
          $items[] = ['name' => $name, 'qty' => $qty, 'unitPrice' => $unitPrice];
        }
      }
    }

    // items_json が無ければ従来のテキストパースを行う
    if (count($items) === 0) {
      $lines = preg_split('/\r\n|\r|\n/', trim((string)$orderContent));
      foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '') {
          continue;
        }

        $name = $line;
        $qty = 1;
        $unitPrice = null;

        if (preg_match('/^(.*?)[×xX]\s*(\d+)(?:@(\d+))?$/u', $line, $m)) {
          $name = trim($m[1]);
          $qty = (int)$m[2];
          if (isset($m[3])) {
            $unitPrice = (int)$m[3];
          }
        } elseif (preg_match('/^(.*)\s+(\d+)(?:@(\d+))?$/u', $line, $m)) {
          $name = trim($m[1]);
          $qty = (int)$m[2];
          if (isset($m[3])) {
            $unitPrice = (int)$m[3];
          }
        }

        if ($qty < 1) {
          $qty = 1;
        }

        $items[] = ['name' => $name, 'qty' => $qty, 'unitPrice' => $unitPrice];
      }
    }

    if (count($items) === 0) {
      // 依然パースできない場合は原文を1行として登録
      $items[] = ['name' => trim((string)$orderContent) ?: '注文', 'qty' => max(1, (int)$amount)];
    }

    // トランザクションで確実に複数行を挿入する
    $pdo->beginTransaction();
    try {
      // 金額分配ロジック
      $sumKnown = 0;
      $remainingQty = 0;
      foreach ($items as $it) {
        if (isset($it['unitPrice']) && $it['unitPrice'] !== null) {
          $sumKnown += (int)$it['unitPrice'] * (int)$it['qty'];
        } else {
          $remainingQty += (int)$it['qty'];
        }
      }

      $remainingAmount = max(0, (int)$amount - $sumKnown);

      if ($remainingQty > 0) {
        $unit = intdiv($remainingAmount, $remainingQty);
        $remainder = $remainingAmount - ($unit * $remainingQty);
      } else {
        $unit = 0;
        $remainder = 0;
      }

      $stmt = $pdo->prepare(
        "INSERT INTO `order_history` (`id`, `席番`, `日時`, `注文内容`, `個数`, `金額`, `配膳フラグ`, `削除フラグ`) VALUES (:id, :seat_no, :datetime, :order_content, :qty, :amount, :served_flag, :deleted_flag)"
      );

      foreach ($items as $index => $it) {
        // IDに不正文字があれば置換し、長すぎる場合は切り詰める
        $safeIdBase = preg_replace('/[^A-Za-z0-9_\-]/', '_', $id);
        $safeIdBase = substr($safeIdBase, 0, 40);
        $rowId = $safeIdBase . '_' . ($index + 1);

        if (isset($it['unitPrice']) && $it['unitPrice'] !== null) {
          $rowAmount = (int)$it['unitPrice'] * (int)$it['qty'];
        } else {
          $rowAmount = $unit * (int)$it['qty'];
          if ($remainder > 0) {
            $extra = min((int)$it['qty'], $remainder);
            $rowAmount += $extra;
            $remainder -= $extra;
          }
        }

        $stmt->bindValue(':id', $rowId, PDO::PARAM_STR);
        $stmt->bindValue(':seat_no', $seatNo, PDO::PARAM_STR);
        $stmt->bindValue(':datetime', $datetime, PDO::PARAM_STR);
        $stmt->bindValue(':order_content', $it['name'], PDO::PARAM_STR);
        $stmt->bindValue(':qty', (int)$it['qty'], PDO::PARAM_INT);
        $stmt->bindValue(':amount', (int)$rowAmount, PDO::PARAM_INT);
        $stmt->bindValue(':served_flag', $servedFlag, PDO::PARAM_INT);
        $stmt->bindValue(':deleted_flag', $deletedFlag, PDO::PARAM_INT);

        $stmt->execute();
      }

      $pdo->commit();
      echo json_encode(['success' => true]);
    } catch (Exception $e) {
      $pdo->rollBack();
      echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }

  } catch (PDOException $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
  }

?>