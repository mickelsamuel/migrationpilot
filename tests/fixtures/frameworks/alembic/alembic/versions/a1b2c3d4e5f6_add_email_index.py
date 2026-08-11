"""add email index

Revision ID: a1b2c3d4e5f6
Revises:
Create Date: 2024-02-07 12:00:00.000000
"""

from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = None


def upgrade():
    op.create_index("idx_users_email", "users", ["email"])


def downgrade():
    op.drop_index("idx_users_email", table_name="users")
