# MinIO Server (S3-compatible storage)
FROM minio/minio:RELEASE.2025-09-07T16-13-09Z

WORKDIR /data

# Ports:
# 9000 = S3 API
# 9001 = Web console
EXPOSE 9000 9001

# Entrypoint / Command
ENTRYPOINT ["minio"]
CMD ["server", "/data", "--console-address", ":9001"]
