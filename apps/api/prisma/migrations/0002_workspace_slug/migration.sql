ALTER TABLE "Workspace"
  ADD COLUMN "slug" TEXT;

WITH ranked_slugs AS (
  SELECT
    "id",
    COALESCE(
      NULLIF(
        TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER("name"), '[^a-z0-9]+', '-', 'g')),
        ''
      ),
      'workspace'
    ) AS base_slug,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(
        NULLIF(
          TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER("name"), '[^a-z0-9]+', '-', 'g')),
          ''
        ),
        'workspace'
      )
      ORDER BY
        CASE WHEN "status" = 'ACTIVE' THEN 0 ELSE 1 END,
        "createdAt",
        "id"
    ) AS slug_rank
  FROM "Workspace"
)
UPDATE "Workspace" AS workspace
SET "slug" = CASE
  WHEN ranked_slugs.slug_rank = 1 THEN ranked_slugs.base_slug
  ELSE ranked_slugs.base_slug || '-' || SUBSTRING(REPLACE(workspace."id"::text, '-', '') FROM 1 FOR 8)
END
FROM ranked_slugs
WHERE ranked_slugs."id" = workspace."id";

ALTER TABLE "Workspace"
  ALTER COLUMN "slug" SET NOT NULL;

DROP INDEX "Workspace_active_name_key";

CREATE UNIQUE INDEX "Workspace_active_slug_key"
  ON "Workspace"("slug")
  WHERE ("status" = 'ACTIVE');
