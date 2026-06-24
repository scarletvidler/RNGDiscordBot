


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."pokemon" (
    "handle" "text" NOT NULL,
    "id" bigint NOT NULL,
    "form_id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "form_name" "text",
    "height" integer,
    "weight" integer,
    "capture_rate" integer,
    "gender_rate" integer,
    "is_baby" boolean DEFAULT false NOT NULL,
    "is_legendary" boolean DEFAULT false NOT NULL,
    "is_mythical" boolean DEFAULT false NOT NULL,
    "flavor_text" "text",
    "form_sprite_front" "text",
    "form_sprite_shiny" "text",
    "dream_sprite_front_female" "text",
    "dream_sprite_front_default" "text",
    "official_sprite_front_shiny" "text",
    "official_sprite_front_default" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pokemon" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "server_id" "uuid" NOT NULL,
    "last_rolled_at" timestamp with time zone
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."servers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "discord_server_id" "text" NOT NULL,
    "server_name" "text"
);


ALTER TABLE "public"."servers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_pokemon" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "pokemon_handle" "text" NOT NULL,
    "shiny" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."user_pokemon" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "discord_id" "text" NOT NULL,
    "username" "text"
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."pokemon"
    ADD CONSTRAINT "pokemon1_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."pokemon"
    ADD CONSTRAINT "pokemon1_pkey" PRIMARY KEY ("handle");



ALTER TABLE ONLY "public"."pokemon"
    ADD CONSTRAINT "pokemon_id_form_id_key" UNIQUE ("id", "form_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_unique_pair" UNIQUE ("user_id", "server_id");



ALTER TABLE ONLY "public"."servers"
    ADD CONSTRAINT "servers_discord_server_id_key" UNIQUE ("discord_server_id");



ALTER TABLE ONLY "public"."servers"
    ADD CONSTRAINT "servers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_pokemon"
    ADD CONSTRAINT "user_pokemon_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_pokemon"
    ADD CONSTRAINT "user_pokemon_unique_pair" UNIQUE ("profile_id", "pokemon_handle");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_discord_id_key" UNIQUE ("discord_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."user_pokemon"
    ADD CONSTRAINT "user_pokemon_pokemon_handle_fkey" FOREIGN KEY ("pokemon_handle") REFERENCES "public"."pokemon"("handle");



ALTER TABLE ONLY "public"."user_pokemon"
    ADD CONSTRAINT "user_pokemon_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE "public"."pokemon" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."servers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_pokemon" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


GRANT ALL ON TABLE "public"."pokemon" TO "anon";
GRANT ALL ON TABLE "public"."pokemon" TO "authenticated";
GRANT ALL ON TABLE "public"."pokemon" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."servers" TO "anon";
GRANT ALL ON TABLE "public"."servers" TO "authenticated";
GRANT ALL ON TABLE "public"."servers" TO "service_role";



GRANT ALL ON TABLE "public"."user_pokemon" TO "anon";
GRANT ALL ON TABLE "public"."user_pokemon" TO "authenticated";
GRANT ALL ON TABLE "public"."user_pokemon" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";
