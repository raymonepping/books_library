export class AppError extends Error {
  constructor(message, status = 500) {
    super(message)
    this.status = status
  }
}

export class NotFoundError extends AppError {
  constructor(resource, id) {
    super(`${resource} not found: ${id}`, 404)
  }
}

export class ValidationError extends AppError {
  constructor(message) {
    super(message, 400)
  }
}
