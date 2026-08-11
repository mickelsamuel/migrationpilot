package migrations

import (
	"context"
	"database/sql"

	"github.com/pressly/goose/v3"
)

func init() {
	goose.AddMigrationContext(upBackfill, downBackfill)
}

func upBackfill(ctx context.Context, tx *sql.Tx) error {
	_, err := tx.ExecContext(ctx, "UPDATE users SET nickname = email WHERE nickname IS NULL")
	return err
}

func downBackfill(ctx context.Context, tx *sql.Tx) error {
	return nil
}
