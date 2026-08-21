-- Keep Native Host Balancer relations compatible with the upstream users UUID -> numeric ID migration.
ALTER TABLE "host_balancer_assignments" ADD COLUMN "user_id" BIGINT;
ALTER TABLE "host_balancer_decisions" ADD COLUMN "user_id" BIGINT;

UPDATE "host_balancer_assignments" AS assignment
SET "user_id" = users."id"
FROM "users"
WHERE assignment."user_uuid" = users."uuid";

UPDATE "host_balancer_decisions" AS decision
SET "user_id" = users."id"
FROM "users"
WHERE decision."user_uuid" = users."uuid";

ALTER TABLE "host_balancer_assignments" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "host_balancer_decisions" ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "host_balancer_assignments"
    DROP CONSTRAINT "host_balancer_assignments_user_uuid_fkey";
ALTER TABLE "host_balancer_decisions"
    DROP CONSTRAINT "host_balancer_decisions_user_uuid_fkey";

DROP INDEX "host_balancer_assignments_host_uuid_user_uuid_key";
DROP INDEX "host_balancer_decisions_user_uuid_created_at_idx";

ALTER TABLE "host_balancer_assignments" DROP COLUMN "user_uuid";
ALTER TABLE "host_balancer_decisions" DROP COLUMN "user_uuid";

CREATE UNIQUE INDEX "host_balancer_assignments_host_uuid_user_id_key"
    ON "host_balancer_assignments"("host_uuid", "user_id");
CREATE INDEX "host_balancer_decisions_user_id_created_at_idx"
    ON "host_balancer_decisions"("user_id", "created_at" DESC);

ALTER TABLE "host_balancer_assignments"
    ADD CONSTRAINT "host_balancer_assignments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "host_balancer_decisions"
    ADD CONSTRAINT "host_balancer_decisions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
