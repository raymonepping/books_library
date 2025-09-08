#!/bin/bash

# Define variables
CONTAINER_NAME="vanilla"
IMAGE_NAME="couchbase-bakeray-vanilla"
VOLUME_NAME="vault_data"

echo "Stopping and removing the $CONTAINER_NAME container..."
# Stop and remove the container if it exists
if docker ps -a | grep -q $CONTAINER_NAME; then
  docker stop $CONTAINER_NAME
  docker rm $CONTAINER_NAME
  echo "$CONTAINER_NAME container removed successfully."
else
  echo "No $CONTAINER_NAME container found."
fi

echo "Removing the $IMAGE_NAME image..."
# Remove the Docker image
if docker images | grep -q $IMAGE_NAME; then
  IMAGE_ID=$(docker images | grep $IMAGE_NAME | awk '{print $3}')
  docker rmi -f $IMAGE_ID
  echo "$IMAGE_NAME image removed successfully."
else
  echo "No $IMAGE_NAME image found."
fi

echo "Checking for associated volumes..."
# Remove associated volumes
if docker volume ls | grep -q $VOLUME_NAME; then
  docker volume rm $VOLUME_NAME
  echo "$VOLUME_NAME volume removed successfully."
else
  echo "No $VOLUME_NAME volume found."
fi

echo "Cleanup complete for $CONTAINER_NAME."
