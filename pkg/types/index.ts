/**
 * Booking Titanium - Type Definitions (Go-like strict typing)
 * 
 * Patrones de tipado estricto equivalentes a Go:
 * - Result<T, E> para operaciones que pueden fallar (como error return)
 * - Option<T> para valores opcionales (como *Type = nil)
 * - Branding para tipos primitivos (como type UserID string)
 * - Nunca any, undefined, o NaN implícitos
 */

// ============================================================================
// RESULT PATTERN (Equivalente a Go's (T, error) return)
// ============================================================================

/**
 * Result representa una operación que puede fallar
 * Equivalente a Go: func operation() (T, error)
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Crea un Result exitoso
 * Equivalente a Go: return value, nil
 */
export const ok = <T>(data: T): Result<T, never> => ({
  success: true,
  data,
});

/**
 * Crea un Result fallido
 * Equivalente a Go: return zeroValue, err
 */
export const err = <E>(error: E): Result<never, E> => ({
  success: false,
  error,
});

/**
 * Helper para unwrap de Results con valor por defecto
 * Equivalente a Go: if err != nil { return defaultValue }
 */
export const unwrapOr = <T>(result: Result<T, unknown>, defaultValue: T): T =>
  result.success ? result.data : defaultValue;

/**
 * Helper para unwrap de Results con panic si falla
 * Equivalente a Go: if err != nil { panic(err) }
 */
export const unwrap = <T>(result: Result<T, unknown>): T => {
  if (result.success) {
    return result.data;
  }
  throw result.error instanceof Error
    ? result.error
    : new Error(String(result.error));
};

// ============================================================================
// OPTION PATTERN (Equivalente a Go's *Type = nil)
// ============================================================================

/**
 * Option representa un valor que puede estar ausente
 * Equivalente a Go: var value *Type = nil
 */
export type Option<T> =
  | { type: 'some'; value: T }
  | { type: 'none' };

/**
 * Crea un Option con valor
 * Equivalente a Go: return &value
 */
export const some = <T>(value: T): Option<T> => ({
  type: 'some',
  value,
});

/**
 * Crea un Option sin valor
 * Equivalente a Go: return nil
 */
export const none = <T>(): Option<T> => ({
  type: 'none',
});

/**
 * Helper para unwrap de Options con valor por defecto
 * Equivalente a Go: if value == nil { return defaultValue }
 */
export const unwrapOptionOr = <T>(option: Option<T>, defaultValue: T): T =>
  option.type === 'some' ? option.value : defaultValue;

/**
 * Helper para convertir Option a Result
 * Equivalente a Go: if value == nil { return nil, err }
 */
export const optionToResult = <T, E>(
  option: Option<T>,
  error: E
): Result<T, E> =>
  option.type === 'some' ? ok(option.value) : err(error);

// ============================================================================
// BRANDING (Equivalente a Go's type definitions)
// ============================================================================

/**
 * Brand para tipos primitivos
 * Equivalente a Go: type UserID string
 */
type Brand<T, B> = T & { readonly __brand: B };

/**
 * Tipos brandeados para el dominio de booking
 */
export type ChatID = Brand<string, 'ChatID'>;
export type BookingID = Brand<string, 'BookingID'>;
export type ProviderID = Brand<string, 'ProviderID'>;
export type ServiceID = Brand<string, 'ServiceID'>;
export type UserID = Brand<string, 'UserID'>;

/**
 * Creadores de tipos brandeados con validación
 */
export const createChatID = (id: string): Result<ChatID, ValidationError> => {
  if (!/^\d+$/.test(id)) {
    return err(new ValidationError('ChatID must be numeric'));
  }
  return ok(id as ChatID);
};

export const createBookingID = (
  id: string
): Result<BookingID, ValidationError> => {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    return err(new ValidationError('BookingID must be valid UUID'));
  }
  return ok(id as BookingID);
};

export const createProviderID = (
  id: string
): Result<ProviderID, ValidationError> => {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    return err(new ValidationError('ProviderID must be valid UUID'));
  }
  return ok(id as ProviderID);
};

export const createServiceID = (
  id: string
): Result<ServiceID, ValidationError> => {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    return err(new ValidationError('ServiceID must be valid UUID'));
  }
  return ok(id as ServiceID);
};

// ============================================================================
// ERROR TYPES (Equivalente a Go's custom error types)
// ============================================================================

/**
 * Error de validación
 * Equivalente a Go: type ValidationError struct { Message string }
 */
export class ValidationError extends Error {
  public readonly code: string = 'VALIDATION_ERROR';
  public readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Error de negocio
 * Equivalente a Go: type BusinessError struct { Message string }
 */
export class BusinessError extends Error {
  public readonly code: string = 'BUSINESS_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'BusinessError';
  }
}

/**
 * Error de infraestructura
 * Equivalente a Go: type InfrastructureError struct { Message string }
 */
export class InfrastructureError extends Error {
  public readonly code: string = 'INFRASTRUCTURE_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'InfrastructureError';
  }
}

// ============================================================================
// UTILITY TYPES (Equivalente a Go's utility patterns)
// ============================================================================

/**
 * Never type para exhaustiveness checking
 * Equivalente a Go: default case en switch con panic
 */
export type Never = never;

/**
 * Assert que un valor nunca ocurre (exhaustiveness check)
 * Equivalente a Go: default: panic("unreachable")
 */
export const assertNever = (value: Never): never => {
  throw new Error(`Unexpected value: ${value}`);
};

/**
 * NonNullable type (excluye null y undefined)
 * Equivalente a Go: *Type (pointer que puede ser nil)
 */
export type NonNullable<T> = T extends null | undefined ? never : T;

/**
 * Nullable type (incluye null explícitamente)
 * Equivalente a Go: *Type (puede ser nil)
 */
export type Nullable<T> = T | null;

/**
 * Mutable type (remueve readonly)
 * Equivalente a Go: var x Type (mutable por defecto)
 */
export type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

// ============================================================================
// FUNCTION TYPES (Equivalente a Go's function signatures)
// ============================================================================

/**
 * Función que nunca retorna (siempre lanza error)
 * Equivalente a Go: func() error (siempre retorna error)
 */
export type NeverReturns = () => never;

/**
 * Función asíncrona que puede fallar
 * Equivalente a Go: func() (T, error)
 */
export type AsyncResult<T, E = Error> = () => Promise<Result<T, E>>;

/**
 * Función pura (sin efectos secundarios)
 * Equivalente a Go: func(T) U (sin I/O)
 */
export type PureFunction<T, U> = (input: T) => U;

// ============================================================================
// ARRAY UTILITIES (Equivalente a Go's slice operations)
// ============================================================================

/**
 * Obtiene el primer elemento de un array de forma segura
 * Equivalente a Go: if len(slice) > 0 { return slice[0], nil }
 */
export const first = <T>(array: readonly T[]): Option<T> =>
  array.length > 0 ? some(array[0]!) : none();

/**
 * Obtiene el último elemento de un array de forma segura
 * Equivalente a Go: if len(slice) > 0 { return slice[len(slice)-1], nil }
 */
export const last = <T>(array: readonly T[]): Option<T> =>
  array.length > 0 ? some(array[array.length - 1]!) : none();

/**
 * Obtiene un elemento por índice de forma segura
 * Equivalente a Go: if index >= 0 && index < len(slice) { return slice[index], nil }
 */
export const at = <T>(array: readonly T[], index: number): Option<T> => {
  const safeIndex = index < 0 ? array.length + index : index;
  return safeIndex >= 0 && safeIndex < array.length
    ? some(array[safeIndex]!)
    : none();
};

/**
 * Filtra un array manteniendo type safety
 * Equivalente a Go: for _, v := range slice { if condition { result = append(result, v) } }
 */
export const filterMap = <T, U>(
  array: readonly T[],
  fn: (item: T) => Option<U>
): U[] => {
  const result: U[] = [];
  for (const item of array) {
    const mapped = fn(item);
    if (mapped.type === 'some') {
      result.push(mapped.value);
    }
  }
  return result;
};

// ============================================================================
// TYPE GUARDS (Equivalente a Go's type assertions)
// ============================================================================

/**
 * Type guard para verificar si un valor es string
 * Equivalente a Go: if _, ok := value.(string)
 */
export const isString = (value: unknown): value is string =>
  typeof value === 'string';

/**
 * Type guard para verificar si un valor es number (no NaN)
 * Equivalente a Go: if num, ok := value.(float64)
 */
export const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && !Number.isNaN(value);

/**
 * Type guard para verificar si un valor es boolean
 * Equivalente a Go: if bool, ok := value.(bool)
 */
export const isBoolean = (value: unknown): value is boolean =>
  typeof value === 'boolean';

/**
 * Type guard para verificar si un valor es null
 * Equivalente a Go: if value == nil
 */
export const isNull = (value: unknown): value is null => value === null;

/**
 * Type guard para verificar si un valor es undefined
 * Equivalente a Go: N/A (undefined no existe en Go)
 */
export const isUndefined = (value: unknown): value is undefined =>
  value === undefined;

/**
 * Type guard para verificar si un valor es Result
 */
export const isResult = <T, E>(value: unknown): value is Result<T, E> =>
  typeof value === 'object' &&
  value !== null &&
  'success' in value &&
  typeof (value as Result<T, E>).success === 'boolean';

/**
 * Type guard para verificar si un valor es Option
 */
export const isOption = <T>(value: unknown): value is Option<T> =>
  typeof value === 'object' &&
  value !== null &&
  'type' in value &&
  ((value as Option<T>).type === 'some' || (value as Option<T>).type === 'none');
