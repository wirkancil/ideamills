// Centralised worker concurrency constants.

export const WORKER_CONCURRENCY = 1;          // 1 job at a time — setiap job sudah sequential chain (3 clip × 10 menit = 30 menit), parallel job menyebabkan OOM
export const MAX_QUEUE_DEPTH = 10;            // max pending jobs sebelum reject submission baru
