-- =============================================================================
-- DONCOR WINGS PTFS - Applications Admin Dashboard Database Setup
-- =============================================================================

-- 1. Create Tables
-- -----------------------------------------------------------------------------

-- Admin Sessions Table for single-use link authentication
CREATE TABLE IF NOT EXISTS public.admin_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT UNIQUE NOT NULL,
    discord_user_id TEXT,
    used BOOLEAN NOT NULL DEFAULT false,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Application Questions Table
CREATE TABLE IF NOT EXISTS public.application_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    position TEXT NOT NULL DEFAULT 'pilot',
    question_text TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    min_words INTEGER NOT NULL DEFAULT 0,
    is_required BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Application Settings Table (Key-Value Store)
CREATE TABLE IF NOT EXISTS public.application_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Row Level Security (RLS) Configuration
-- -----------------------------------------------------------------------------

ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_settings ENABLE ROW LEVEL SECURITY;

-- Anonymous public read access for application questions & settings
CREATE POLICY "Public read application questions" ON public.application_questions
    FOR SELECT USING (true);

CREATE POLICY "Public read application settings" ON public.application_settings
    FOR SELECT USING (true);

-- Restrict direct modification on admin tables for anon role (updates executed via RPCs)
-- (No public INSERT/UPDATE/DELETE policies on admin_sessions, application_questions, application_settings)


-- 3. RPC Functions for Token Validation & Admin Operations
-- -----------------------------------------------------------------------------

-- Function to validate and consume a single-use admin token
CREATE OR REPLACE FUNCTION public.validate_and_consume_admin_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
BEGIN
    SELECT * INTO v_session
    FROM public.admin_sessions
    WHERE token = p_token;

    IF v_session.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid token');
    END IF;

    IF v_session.used THEN
        RETURN jsonb_build_object('success', false, 'error', 'Token has already been used');
    END IF;

    IF v_session.expires_at < now() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Token has expired');
    END IF;

    -- Mark token as used
    UPDATE public.admin_sessions
    SET used = true
    WHERE id = v_session.id;

    RETURN jsonb_build_object(
        'success', true,
        'token', v_session.token,
        'discord_user_id', v_session.discord_user_id
    );
END;
$$;

-- Helper function to verify an admin token has been validated (used) and isn't expired
CREATE OR REPLACE FUNCTION public.is_valid_admin_session(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.admin_sessions
        WHERE token = p_token AND used = true AND expires_at >= now()
    ) INTO v_exists;

    RETURN v_exists;
END;
$$;

-- Admin RPC: Upsert Application Question
CREATE OR REPLACE FUNCTION public.admin_save_question(
    p_token TEXT,
    p_id UUID,
    p_position TEXT,
    p_question_text TEXT,
    p_order_index INTEGER,
    p_min_words INTEGER,
    p_is_required BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT public.is_valid_admin_session(p_token) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized admin session');
    END IF;

    IF p_id IS NULL THEN
        INSERT INTO public.application_questions (position, question_text, order_index, min_words, is_required)
        VALUES (p_position, p_question_text, p_order_index, p_min_words, p_is_required);
    ELSE
        UPDATE public.application_questions
        SET position = p_position,
            question_text = p_question_text,
            order_index = p_order_index,
            min_words = p_min_words,
            is_required = p_is_required
        WHERE id = p_id;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- Admin RPC: Delete Application Question
CREATE OR REPLACE FUNCTION public.admin_delete_question(
    p_token TEXT,
    p_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT public.is_valid_admin_session(p_token) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized admin session');
    END IF;

    DELETE FROM public.application_questions WHERE id = p_id;
    RETURN jsonb_build_object('success', true);
END;
$$;

-- Admin RPC: Save Application Setting
CREATE OR REPLACE FUNCTION public.admin_save_setting(
    p_token TEXT,
    p_key TEXT,
    p_value TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT public.is_valid_admin_session(p_token) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized admin session');
    END IF;

    INSERT INTO public.application_settings (key, value, updated_at)
    VALUES (p_key, p_value, now())
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = now();

    RETURN jsonb_build_object('success', true);
END;
$$;
