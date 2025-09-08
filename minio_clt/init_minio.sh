#!/usr/bin/env sh
set -eu

: "${MINIO_HOST:=minio}"
: "${MINIO_PORT:=9000}"
: "${MINIO_ROOT_USER:?MINIO_ROOT_USER missing}"
: "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD missing}"
: "${MINIO_BUCKET:=booklib}"
: "${MINIO_APP_USER:=booklib}"
: "${MINIO_APP_PASSWORD:=booklib-secret}"
: "${MINIO_ALIAS:=local}"

MC="mc"

echo "➡️  Setting alias $MINIO_ALIAS -> http://$MINIO_HOST:$MINIO_PORT"
$MC alias set "$MINIO_ALIAS" "http://$MINIO_HOST:$MINIO_PORT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null

# Create bucket if missing (idempotent: mb fails if exists; ignore)
if $MC ls "$MINIO_ALIAS/$MINIO_BUCKET" >/dev/null 2>&1; then
  echo "🪣 Bucket exists: $MINIO_BUCKET"
else
  echo "🪣 Creating bucket: $MINIO_BUCKET"
  $MC mb "$MINIO_ALIAS/$MINIO_BUCKET"
fi

# Enable versioning (safe to run repeatedly)
echo "🔁 Enabling versioning on: $MINIO_BUCKET"
$MC version enable "$MINIO_ALIAS/$MINIO_BUCKET" >/dev/null 2>&1 || true

# Create or enable app user
if $MC admin user info "$MINIO_ALIAS" "$MINIO_APP_USER" >/dev/null 2>&1; then
  echo "👤 User exists: $MINIO_APP_USER (ensuring active)"
  $MC admin user enable "$MINIO_ALIAS" "$MINIO_APP_USER" >/dev/null 2>&1 || true
else
  echo "👤 Creating user: $MINIO_APP_USER"
  $MC admin user add "$MINIO_ALIAS" "$MINIO_APP_USER" "$MINIO_APP_PASSWORD"
fi

# Create bucket-scoped readwrite policy JSON
POLICY_NAME="${MINIO_BUCKET}-rw"
POLICY_JSON="/tmp/${POLICY_NAME}.json"
cat > "$POLICY_JSON" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["s3:ListBucket"], "Resource": ["arn:aws:s3:::${MINIO_BUCKET}"] },
    { "Effect": "Allow", "Action": ["s3:GetBucketLocation","s3:ListBucketMultipartUploads"], "Resource": ["arn:aws:s3:::${MINIO_BUCKET}"] },
    { "Effect": "Allow", "Action": ["s3:PutObject","s3:GetObject","s3:DeleteObject","s3:AbortMultipartUpload","s3:ListMultipartUploadParts"],
      "Resource": ["arn:aws:s3:::${MINIO_BUCKET}/*"] }
  ]
}
EOF

# Create or update policy (newer mc syntax)
echo "📝 Ensuring policy: $POLICY_NAME"
if ! $MC admin policy create "$MINIO_ALIAS" "$POLICY_NAME" "$POLICY_JSON" >/dev/null 2>&1; then
  # If create failed (likely exists), update it
  $MC admin policy update "$MINIO_ALIAS" "$POLICY_NAME" "$POLICY_JSON" >/dev/null
fi

# Attach policy to the app user
$MC admin policy attach "$MINIO_ALIAS" "$POLICY_NAME" --user "$MINIO_APP_USER" >/dev/null

echo "✅ MinIO bootstrap complete."
