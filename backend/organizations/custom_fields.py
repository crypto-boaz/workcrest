from datetime import date
from decimal import Decimal, InvalidOperation

from rest_framework.exceptions import ValidationError

from .models import CustomFieldDefinition


def validate_custom_data(*, organization, module_code, entity_type, values):
    if not isinstance(values, dict):
        raise ValidationError("Custom fields must be a JSON object.")
    definitions = {
        definition.key: definition
        for definition in CustomFieldDefinition.objects.filter(
            organization=organization,
            module_code=module_code,
            entity_type=entity_type,
            is_active=True,
        )
    }
    unknown = set(values) - set(definitions)
    if unknown:
        raise ValidationError(
            {
                key: "This custom field is not configured for this record."
                for key in sorted(unknown)
            }
        )
    errors = {}
    normalized = {}
    for key, definition in definitions.items():
        value = values.get(key)
        if definition.required and value in (None, ""):
            errors[key] = "This custom field is required."
            continue
        if value in (None, ""):
            if key in values:
                normalized[key] = value
            continue
        try:
            if definition.field_type == CustomFieldDefinition.FieldType.TEXT:
                value = str(value)
                max_length = definition.validation.get("max_length")
                if max_length and len(value) > int(max_length):
                    raise ValueError(f"Use at most {max_length} characters.")
            elif definition.field_type == CustomFieldDefinition.FieldType.NUMBER:
                value = str(Decimal(str(value)))
            elif definition.field_type == CustomFieldDefinition.FieldType.DATE:
                value = date.fromisoformat(str(value)).isoformat()
            elif definition.field_type == CustomFieldDefinition.FieldType.BOOLEAN:
                if not isinstance(value, bool):
                    raise ValueError("Enter true or false.")
            elif definition.field_type == CustomFieldDefinition.FieldType.SELECT:
                if value not in definition.options:
                    raise ValueError("Choose one of the configured options.")
            normalized[key] = value
        except (ValueError, TypeError, InvalidOperation) as exc:
            errors[key] = str(exc) or "Enter a valid value."
    if errors:
        raise ValidationError(errors)
    return normalized
