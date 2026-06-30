from django.db import migrations


TENANT_TABLES = [
    "organizations_location",
    "organizations_customfielddefinition",
    "organizations_brandingprofile",
    "organizations_membership",
    "organizations_role",
    "organizations_roleassignment",
    "organizations_rolecapability",
    "organizations_invitation",
    "organizations_invitationlocationscope",
    "organizations_tenantdomain",
    "organizations_tenantmodule",
    "subscriptions_subscription",
    "subscriptions_invoice",
    "subscriptions_manualpayment",
    "audit_auditevent",
    "audit_outboxevent",
    "audit_idempotencyrecord",
    "audit_exportjob",
    "notifications_notification",
    "notifications_notificationrecipient",
    "platform_admin_supportsession",
    "commerce_category",
    "commerce_product",
    "commerce_inventorybalance",
    "commerce_stockmovement",
    "commerce_customer",
    "commerce_supplier",
    "commerce_documentsequence",
    "commerce_sale",
    "commerce_saleitem",
    "commerce_payment",
    "commerce_heldcart",
    "commerce_returnrecord",
    "commerce_returnitem",
    "commerce_purchaseorder",
    "commerce_purchaseitem",
    "commerce_stocktransfer",
    "commerce_transferitem",
    "commerce_customerledgerentry",
    "commerce_supplierledgerentry",
    "commerce_expense",
]


def enable_rls(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    quote = schema_editor.quote_name
    for table in TENANT_TABLES:
        policy = f"{table}_tenant_isolation"
        schema_editor.execute(f"ALTER TABLE {quote(table)} ENABLE ROW LEVEL SECURITY")
        schema_editor.execute(f"ALTER TABLE {quote(table)} FORCE ROW LEVEL SECURITY")
        schema_editor.execute(
            f"""
            CREATE POLICY {quote(policy)} ON {quote(table)}
            USING (
                organization_id =
                NULLIF(current_setting('app.current_organization_id', true), '')::uuid
            )
            WITH CHECK (
                organization_id =
                NULLIF(current_setting('app.current_organization_id', true), '')::uuid
            )
            """
        )


def disable_rls(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    quote = schema_editor.quote_name
    for table in reversed(TENANT_TABLES):
        policy = f"{table}_tenant_isolation"
        schema_editor.execute(
            f"DROP POLICY IF EXISTS {quote(policy)} ON {quote(table)}"
        )
        schema_editor.execute(f"ALTER TABLE {quote(table)} DISABLE ROW LEVEL SECURITY")


class Migration(migrations.Migration):
    dependencies = [
        ("organizations", "0001_initial"),
        ("subscriptions", "0001_initial"),
        ("audit", "0002_exportjob"),
        ("commerce", "0001_initial"),
        ("notifications", "0001_initial"),
        ("platform_admin", "0001_initial"),
    ]

    operations = [migrations.RunPython(enable_rls, disable_rls)]
