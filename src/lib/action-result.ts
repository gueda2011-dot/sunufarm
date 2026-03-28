export interface ActionFailure {
  success: false
  error: string
  code?: string
  status?: number
  fieldErrors?: Record<string, string[]>
}

export interface ActionSuccess<T> {
  success: true
  data: T
}

export type ActionResult<T = void> = ActionSuccess<T> | ActionFailure

interface FailureOptions {
  code?: string
  status?: number
  fieldErrors?: Record<string, string[]>
}

export function actionSuccess<T>(data: T): ActionSuccess<T> {
  return { success: true, data }
}

export function actionFailure(
  error: string,
  options: FailureOptions = {},
): ActionFailure {
  return {
    success: false,
    error,
    code: options.code ?? "ACTION_ERROR",
    status: options.status ?? 400,
    ...(options.fieldErrors ? { fieldErrors: options.fieldErrors } : {}),
  }
}

export function invalidInput(
  error = "Donnees invalides",
  fieldErrors?: Record<string, string[]>,
): ActionFailure {
  return actionFailure(error, {
    code: "INVALID_INPUT",
    status: 400,
    fieldErrors,
  })
}

export function unauthenticated(
  error = "Non authentifie",
): ActionFailure {
  return actionFailure(error, {
    code: "UNAUTHENTICATED",
    status: 401,
  })
}

export function forbidden(
  error = "Permission refusee",
  code = "FORBIDDEN",
): ActionFailure {
  return actionFailure(error, {
    code,
    status: 403,
  })
}

export function notFound(
  error: string,
  code = "NOT_FOUND",
): ActionFailure {
  return actionFailure(error, {
    code,
    status: 404,
  })
}

export function conflict(
  error: string,
  code = "CONFLICT",
): ActionFailure {
  return actionFailure(error, {
    code,
    status: 409,
  })
}

export function technicalError(
  error: string,
  code = "TECHNICAL_ERROR",
): ActionFailure {
  return actionFailure(error, {
    code,
    status: 500,
  })
}
