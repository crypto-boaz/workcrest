import re

from django.core.management.base import BaseCommand, CommandError
from django.db import connection


ROLE_PATTERN = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")


class Command(BaseCommand):
    help = "Grant least-privilege access to the non-owner runtime database role."

    def add_arguments(self, parser):
        parser.add_argument("--runtime-role", default="workcrest_runtime")

    def handle(self, *args, **options):
        role = options["runtime_role"]
        if not ROLE_PATTERN.fullmatch(role):
            raise CommandError("Runtime role name is invalid.")
        if connection.vendor != "postgresql":
            self.stdout.write("Skipped: database is not PostgreSQL.")
            return
        quoted_role = connection.ops.quote_name(role)
        with connection.cursor() as cursor:
            cursor.execute("SELECT current_database()")
            database_name = cursor.fetchone()[0]
            quoted_database = connection.ops.quote_name(database_name)
            cursor.execute(
                f"GRANT CONNECT ON DATABASE {quoted_database} TO {quoted_role}"
            )
            cursor.execute(f"GRANT USAGE ON SCHEMA public TO {quoted_role}")
            cursor.execute(
                f"GRANT SELECT, INSERT, UPDATE, DELETE "
                f"ON ALL TABLES IN SCHEMA public TO {quoted_role}"
            )
            cursor.execute(
                f"GRANT USAGE, SELECT ON ALL SEQUENCES "
                f"IN SCHEMA public TO {quoted_role}"
            )
            cursor.execute(
                f"ALTER DEFAULT PRIVILEGES IN SCHEMA public "
                f"GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {quoted_role}"
            )
            cursor.execute(
                f"ALTER DEFAULT PRIVILEGES IN SCHEMA public "
                f"GRANT USAGE, SELECT ON SEQUENCES TO {quoted_role}"
            )
        self.stdout.write(self.style.SUCCESS(f"Configured runtime role {role}."))
