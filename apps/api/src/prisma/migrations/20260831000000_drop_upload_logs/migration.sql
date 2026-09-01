-- The upload audit trail was write-only: rows were created on every upload but nothing ever read
-- them, so it only accumulated the Drive owner's file names indefinitely with no retention path
-- and no way to purge them on disconnect. Dropped rather than given a retention policy, since the
-- history view it was built for was never implemented.
DROP TABLE IF EXISTS "upload_logs";
DROP TYPE IF EXISTS "UploadStatus";
