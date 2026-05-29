<?php
// タイムゾーンを日本に設定
// date_default_timezone_set('Asia/Tokyo');

// データベース接続情報
$host = 'localhost';
$dbname = 'mos';
$username = 'null';
$password = 'null';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // POSTデータを取得（新旧キーを受け付け）
    $id = $_POST['id'] ?? ('order_' . time());
    $seatNo = $_POST['seat_no'] ?? ($_POST['name'] ?? 'unknown');
    $orderContent = $_POST['order_content'] ?? ($_POST['data'] ?? '');
    $amount = isset($_POST['amount']) ? (int)$_POST['amount'] : 0;
    $servedFlag = isset($_POST['served_flag']) ? (int)$_POST['served_flag'] : 0;
    $deletedFlag = isset($_POST['deleted_flag']) ? (int)$_POST['deleted_flag'] : 0;

    // クライアント時刻ではなく、日本時間のサーバー時刻を採用
    $now = new DateTime('now', new DateTimeZone('Asia/Tokyo'));
    $datetime = $now->format('Y-m-d H:i:s');

    // 注文内容を改行で分割し、各行を "商品名×個数" の形式で解析して
    // 商品1種類につき1行ずつ `order_history` に挿入する。
    $lines = preg_split('/\r\n|\r|\n/', trim((string)$orderContent));
    $items = [];

    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '') continue;
        // フル幅の '×' や英字の 'x' を許容、かつ末尾に @単価 を付与した形式も許容
        // 例: "ねぎま×2@500" または "枝豆 1@300"
        $name = $line;
        $qty = 1;
        $unitPrice = null;

        if (preg_match('/^(.*?)[×xX]\s*(\d+)(?:@(\d+))?$/u', $line, $m)) {
            $name = trim($m[1]);
            $qty = (int)$m[2];
            if (isset($m[3])) $unitPrice = (int)$m[3];
        } elseif (preg_match('/^(.*)\s+(\d+)(?:@(\d+))?$/u', $line, $m)) {
            // 例: "枝豆 2@300" のような形式
            $name = trim($m[1]);
            $qty = (int)$m[2];
            if (isset($m[3])) $unitPrice = (int)$m[3];
        }

        if ($qty < 1) $qty = 1;
        $items[] = ['name' => $name, 'qty' => $qty, 'unitPrice' => $unitPrice];
    }

    if (count($items) === 0) {
        // パースできない場合は元の文字列をそのまま1行で登録（個数は渡された合計を流用）
        $items[] = ['name' => $orderContent, 'qty' => (int)$amount ?: 1];
    }

    // 挿入用のプリペアドステートメント（各行ごとに実行）
    $stmt = $pdo->prepare(
        "INSERT INTO `order_history` (`id`, `席番`, `日時`, `注文内容`, `個数`, `金額`, `配膳フラグ`, `削除フラグ`) VALUES (:id, :seat_no, :datetime, :order_content, :qty, :amount, :served_flag, :deleted_flag)"
    );

    foreach ($items as $index => $it) {
        // 同一の外部注文IDを保持したい場合はそのまま、DBの制約で被らない必要がある場合はユニーク化
        $rowId = $id . '_' . ($index + 1);

        // 金額割当の前準備はループ外で行うためここではプレースホルダに値をセットして実行するのみ
        // （実際の rowAmount は下で計算して代入します）
        // このループは後で上書きされるのでここでは処理しない
        
        // placeholder — 実際の金額は下の処理で計算して bind します
        // ここはダミー処理を削除して下の分配ロジックへ移行します
    }

    // --- 金額分配ロジック ---
    // まず単価情報がある行の合計を計算し、残りを無単価行の数量に応じて分配する
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

    // 再度プリペアドステートメントで各行を挿入
    foreach ($items as $index => $it) {
        $rowId = $id . '_' . ($index + 1);

        if (isset($it['unitPrice']) && $it['unitPrice'] !== null) {
            $rowAmount = (int)$it['unitPrice'] * (int)$it['qty'];
        } else {
            // 基本金額は単位あたり unit 円
            $rowAmount = $unit * (int)$it['qty'];
            // 端数（yen単位）を数量に応じて先頭から配る
            if ($remainder > 0) {
                $extra = min((int)$it['qty'], $remainder);
                $rowAmount += $extra;
                $remainder -= $extra;
            }
        }

        $stmt->bindValue(':id', $rowId);
        $stmt->bindValue(':seat_no', $seatNo);
        $stmt->bindValue(':datetime', $datetime);
        $stmt->bindValue(':order_content', $it['name']);
        $stmt->bindValue(':qty', (int)$it['qty'], PDO::PARAM_INT);
        $stmt->bindValue(':amount', (int)$rowAmount, PDO::PARAM_INT);
        $stmt->bindValue(':served_flag', $servedFlag, PDO::PARAM_INT);
        $stmt->bindValue(':deleted_flag', $deletedFlag, PDO::PARAM_INT);

        $stmt->execute();
    }

    echo json_encode(['success' => true]);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
?>