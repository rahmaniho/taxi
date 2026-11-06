<?php

namespace App\Services\Sync;

class AgencySyncMergeService
{
    /** @var list<string> */
    public const COLLECTIONS = [
        'drivers',
        'vehicles',
        'addresses',
        'subscribers',
        'subscriberPayments',
        'driverPayments',
        'trips',
        'expenses',
        'closes',
        'invoices',
        'archives',
        'shifts',
    ];

    /**
     * ادغام هوشمند و بدون اتلاف داده بین تصویر سرور و دادهٔ ارسالی کلاینت آفلاین/آنلاین.
     *
     * @param  array<string, mixed>|null  $serverData
     * @param  array<string, mixed>  $clientData
     * @return array{merged: array<string, mixed>, records_count: int}
     */
    public function merge(?array $serverData, array $clientData): array
    {
        $server = is_array($serverData) ? $serverData : [];
        $merged = [];

        $mergedTombstones = $this->mergeTombstones(
            is_array($server['meta']['tombstones'] ?? null) ? $server['meta']['tombstones'] : [],
            is_array($clientData['meta']['tombstones'] ?? null) ? $clientData['meta']['tombstones'] : [],
        );

        $totalRecords = 0;
        foreach (self::COLLECTIONS as $collection) {
            $sList = is_array($server[$collection] ?? null) ? $server[$collection] : [];
            $cList = is_array($clientData[$collection] ?? null) ? $clientData[$collection] : [];
            $colTombstones = $mergedTombstones[$collection] ?? [];

            $mergedList = $this->mergeCollection($sList, $cList, $colTombstones);
            $merged[$collection] = $mergedList;
            $mergedTombstones[$collection] = $colTombstones;
            $totalRecords += count($mergedList);
        }

        // ادغام تنظیمات آژانس (شامل لوگو، نرخ‌ها و مشخصات شرکت) بر اساس آخرین زمان ویرایش
        [$settings, $settingsUpdatedAt] = $this->mergeSettings($server, $clientData);
        $merged['settings'] = $settings;
        $merged['settingsUpdatedAt'] = $settingsUpdatedAt;

        // ادغام شمارنده‌ها و متادیتا (بیشترین مقدار هر شمارنده حفظ می‌شود تا شمارهٔ تکراری تولید نشود)
        $merged['meta'] = $this->mergeMeta(
            is_array($server['meta'] ?? null) ? $server['meta'] : [],
            is_array($clientData['meta'] ?? null) ? $clientData['meta'] : [],
            $mergedTombstones,
        );

        return [
            'merged' => $merged,
            'records_count' => $totalRecords,
        ];
    }

    /**
     * @param  array<string, mixed>  $serverTombstones
     * @param  array<string, mixed>  $clientTombstones
     * @return array<string, array<string, string>>
     */
    private function mergeTombstones(array $serverTombstones, array $clientTombstones): array
    {
        $cutoff = time() - (120 * 86400);
        $out = [];

        foreach (self::COLLECTIONS as $col) {
            $map = [];
            foreach ([$serverTombstones[$col] ?? [], $clientTombstones[$col] ?? []] as $source) {
                if (! is_array($source)) {
                    continue;
                }
                foreach ($source as $id => $iso) {
                    $key = trim((string) $id);
                    $val = trim((string) $iso);
                    if ($key === '' || $val === '') {
                        continue;
                    }
                    $ts = strtotime($val) ?: 0;
                    if ($ts > 0 && $ts < $cutoff) {
                        continue;
                    }
                    $prevTs = isset($map[$key]) ? (strtotime($map[$key]) ?: 0) : 0;
                    if (! isset($map[$key]) || $ts >= $prevTs) {
                        $map[$key] = $val;
                    }
                }
            }
            if ($map !== []) {
                $out[$col] = $map;
            }
        }

        return $out;
    }

    /**
     * @param  list<mixed>  $serverList
     * @param  list<mixed>  $clientList
     * @param  array<string, string>  $tombstones
     * @return list<array<string, mixed>>
     */
    private function mergeCollection(array $serverList, array $clientList, array &$tombstones): array
    {
        /** @var array<string, array<string, mixed>> $byId */
        $byId = [];

        foreach ($serverList as $item) {
            if (! is_array($item)) {
                continue;
            }
            $id = trim((string) ($item['id'] ?? ''));
            if ($id === '') {
                continue;
            }
            $byId[$id] = $item;
        }

        foreach ($clientList as $item) {
            if (! is_array($item)) {
                continue;
            }
            $id = trim((string) ($item['id'] ?? ''));
            if ($id === '') {
                continue;
            }
            if (! isset($byId[$id])) {
                $byId[$id] = $item;
                continue;
            }
            $byId[$id] = $this->pickNewerRecord($byId[$id], $item);
        }

        $result = [];
        foreach ($byId as $id => $record) {
            if (isset($tombstones[$id])) {
                $deletedTs = strtotime($tombstones[$id]) ?: 0;
                $recTs = $this->recordTimestamp($record);
                if ($deletedTs >= $recTs) {
                    continue;
                }
                unset($tombstones[$id]);
            }
            $result[] = $record;
        }

        return $result;
    }

    /**
     * @param  array<string, mixed>  $serverRec
     * @param  array<string, mixed>  $clientRec
     * @return array<string, mixed>
     */
    private function pickNewerRecord(array $serverRec, array $clientRec): array
    {
        $sTime = $this->recordTimestamp($serverRec);
        $cTime = $this->recordTimestamp($clientRec);

        if ($cTime > $sTime) {
            return $clientRec;
        }
        if ($sTime > $cTime) {
            return $serverRec;
        }

        $sRev = (int) ($serverRec['rev'] ?? 0);
        $cRev = (int) ($clientRec['rev'] ?? 0);

        return $cRev >= $sRev ? $clientRec : $serverRec;
    }

    /**
     * @param  array<string, mixed>  $record
     */
    private function recordTimestamp(array $record): int
    {
        foreach (['updatedAt', 'createdAt', 'at'] as $field) {
            if (! empty($record[$field]) && is_string($record[$field])) {
                $ts = strtotime($record[$field]);
                if ($ts !== false) {
                    return $ts;
                }
            }
        }

        return 0;
    }

    /**
     * @param  array<string, mixed>  $server
     * @param  array<string, mixed>  $client
     * @return array{0: array<string, mixed>, 1: string}
     */
    private function mergeSettings(array $server, array $client): array
    {
        $sSettings = is_array($server['settings'] ?? null) ? $server['settings'] : [];
        $cSettings = is_array($client['settings'] ?? null) ? $client['settings'] : [];

        // تنظیمات قفل PIN محلی هر دستگاه خصوصی است و روی سرور ذخیره نمی‌شود
        unset($sSettings['security'], $cSettings['security']);

        $sStamp = ! empty($server['settingsUpdatedAt']) ? (strtotime((string) $server['settingsUpdatedAt']) ?: 0) : 0;
        $cStamp = ! empty($client['settingsUpdatedAt']) ? (strtotime((string) $client['settingsUpdatedAt']) ?: 0) : 0;

        if ($sSettings === []) {
            return [$cSettings, (string) ($client['settingsUpdatedAt'] ?? now()->toIso8601String())];
        }
        if ($cSettings === []) {
            return [$sSettings, (string) ($server['settingsUpdatedAt'] ?? now()->toIso8601String())];
        }

        if ($cStamp >= $sStamp) {
            $merged = array_replace($sSettings, $cSettings);
            // اگر کلاینت لوگو را صراحتاً حذف کرده (null)، حذف اعمال شود؛ اگر اصلاً کلید logo نداشت، قبلی بماند
            if (array_key_exists('logo', $cSettings)) {
                $merged['logo'] = $cSettings['logo'];
            }

            return [$merged, (string) ($client['settingsUpdatedAt'] ?? now()->toIso8601String())];
        }

        return [array_replace($cSettings, $sSettings), (string) ($server['settingsUpdatedAt'] ?? now()->toIso8601String())];
    }

    /**
     * @param  array<string, mixed>  $sMeta
     * @param  array<string, mixed>  $cMeta
     * @param  array<string, array<string, string>>  $tombstones
     * @return array<string, mixed>
     */
    private function mergeMeta(array $sMeta, array $cMeta, array $tombstones): array
    {
        $counters = [];
        foreach (['trip', 'subscriber', 'driver', 'vehicle', 'expense'] as $key) {
            $counters[$key] = max(
                (int) ($sMeta['counters'][$key] ?? 0),
                (int) ($cMeta['counters'][$key] ?? 0),
            );
        }

        $invoiceSeq = [];
        $allSeqKeys = array_unique(array_merge(
            array_keys(is_array($sMeta['invoiceSeq'] ?? null) ? $sMeta['invoiceSeq'] : []),
            array_keys(is_array($cMeta['invoiceSeq'] ?? null) ? $cMeta['invoiceSeq'] : []),
        ));
        foreach ($allSeqKeys as $seqKey) {
            $invoiceSeq[(string) $seqKey] = max(
                (int) ($sMeta['invoiceSeq'][$seqKey] ?? 0),
                (int) ($cMeta['invoiceSeq'][$seqKey] ?? 0),
            );
        }

        return [
            'counters' => $counters,
            'invoiceSeq' => $invoiceSeq,
            'tombstones' => array_filter($tombstones, fn ($list) => ! empty($list)),
        ];
    }
}
