from rest_framework.exceptions import APIException


class ConflictError(APIException):
    status_code = 409
    default_detail = "The operation conflicts with the current resource state."
    default_code = "conflict"


class InsufficientStock(ConflictError):
    default_detail = "There is not enough stock to complete this operation."
    default_code = "insufficient_stock"


class IdempotencyConflict(ConflictError):
    default_detail = "This idempotency key was already used with a different payload."
    default_code = "idempotency_conflict"
