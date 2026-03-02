--
-- PostgreSQL database dump
--

\restrict RPbaNngTBOHzI6twgvDbXEwAqiYWsT2HqLzXL0gp6OSLjlsdR59aMeYOvcfWffU

-- Dumped from database version 17.7 (Debian 17.7-3.pgdg13+1)
-- Dumped by pg_dump version 17.7 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: auto_blacklist_insolvent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_blacklist_insolvent() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.company_legal_status IN ('insolventa', 'faliment', 'radiata') THEN
        NEW.priority_tier = 'blacklist';
        NEW.tier_reasoning = 'Auto-blacklisted: ' || NEW.company_legal_status;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: calculate_read_time(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_read_time() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    word_count INTEGER;
    content_text TEXT;
BEGIN
    -- Extract text from content (strip HTML tags)
    content_text := regexp_replace(NEW.content, '<[^>]+>', ' ', 'g');

    -- Count words (split by whitespace)
    word_count := array_length(regexp_split_to_array(content_text, '\s+'), 1);

    -- Calculate read time (average 200 words/minute, minimum 1 minute)
    NEW.read_time_minutes := GREATEST(1, CEIL(word_count / 200.0));

    RETURN NEW;
END;
$$;


--
-- Name: FUNCTION calculate_read_time(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.calculate_read_time() IS 'Auto-calculate read time based on word count (avg 200 words/min)';


--
-- Name: enrich_lead_with_cui(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enrich_lead_with_cui() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- If CUI is provided and company not yet matched, lookup in firme_ro
    IF NEW.company_cui IS NOT NULL AND NEW.matched_company_id IS NULL THEN
        SELECT id INTO NEW.matched_company_id
        FROM firme_ro
        WHERE cui = NEW.company_cui
        LIMIT 1;

        -- Mark as enriched if company found
        IF NEW.matched_company_id IS NOT NULL THEN
            NEW.is_enriched := TRUE;
            NEW.enriched_at := CURRENT_TIMESTAMP;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: expire_old_signals(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_old_signals() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.expires_at IS NULL THEN
        NEW.expires_at = NEW.data_semnal + INTERVAL '6 months';
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: generate_slug(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_slug(text_input text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
    slug TEXT;
BEGIN
    -- Convert to lowercase, remove Romanian diacritics, replace spaces with hyphens
    slug := lower(text_input);

    -- Replace Romanian characters
    slug := translate(slug, 'ăâîșțĂÂÎȘȚ', 'aaistaaiis');

    -- Remove special characters, keep only alphanumeric and hyphens
    slug := regexp_replace(slug, '[^a-z0-9]+', '-', 'g');

    -- Remove leading/trailing hyphens
    slug := trim(both '-' from slug);

    -- Remove multiple consecutive hyphens
    slug := regexp_replace(slug, '-+', '-', 'g');

    RETURN slug;
END;
$$;


--
-- Name: FUNCTION generate_slug(text_input text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.generate_slug(text_input text) IS 'Generate URL-friendly slug from Romanian text';


--
-- Name: register_cms_slug(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_cms_slug() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    table_name TEXT;
BEGIN
    -- Get table name from trigger context
    table_name := TG_TABLE_NAME;

    -- Check for slug collision with other content types
    IF EXISTS (
        SELECT 1 FROM cms_slugs
        WHERE slug = NEW.slug
        AND content_type != table_name
    ) THEN
        RAISE EXCEPTION 'Slug "%" already exists for another content type', NEW.slug;
    END IF;

    -- Insert or update slug registry
    INSERT INTO cms_slugs (slug, content_type, content_id)
    VALUES (NEW.slug, table_name, NEW.id)
    ON CONFLICT (content_type, content_id)
    DO UPDATE SET
        slug = NEW.slug,
        updated_at = NOW();

    RETURN NEW;
END;
$$;


--
-- Name: FUNCTION register_cms_slug(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.register_cms_slug() IS 'Register slug in global registry and prevent cross-content-type collisions';


--
-- Name: update_author_posts_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_author_posts_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Decrement old author
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.author_id IS NOT NULL THEN
        UPDATE blog_authors
        SET posts_count = GREATEST(0, posts_count - 1),
            updated_at = NOW()
        WHERE id = OLD.author_id;
    END IF;

    -- Increment new author
    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.author_id IS NOT NULL THEN
        UPDATE blog_authors
        SET posts_count = posts_count + 1,
            updated_at = NOW()
        WHERE id = NEW.author_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: FUNCTION update_author_posts_count(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.update_author_posts_count() IS 'Auto-update posts_count for authors';


--
-- Name: update_category_posts_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_category_posts_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Decrement old category
    IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.category_id IS NOT NULL THEN
        UPDATE blog_categories
        SET posts_count = GREATEST(0, posts_count - 1),
            updated_at = NOW()
        WHERE id = OLD.category_id;
    END IF;

    -- Increment new category
    IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.category_id IS NOT NULL THEN
        UPDATE blog_categories
        SET posts_count = posts_count + 1,
            updated_at = NOW()
        WHERE id = NEW.category_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: FUNCTION update_category_posts_count(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.update_category_posts_count() IS 'Auto-update posts_count when blog posts are created/updated/deleted';


--
-- Name: update_modified_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_modified_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


--
-- Name: update_tag_posts_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_tag_posts_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE blog_tags
        SET posts_count = GREATEST(0, posts_count - 1),
            updated_at = NOW()
        WHERE id = OLD.tag_id;
        RETURN OLD;
    ELSIF TG_OP = 'INSERT' THEN
        UPDATE blog_tags
        SET posts_count = posts_count + 1,
            updated_at = NOW()
        WHERE id = NEW.tag_id;
        RETURN NEW;
    END IF;
END;
$$;


--
-- Name: FUNCTION update_tag_posts_count(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.update_tag_posts_count() IS 'Auto-update posts_count when post-tag relationships change';


--
-- Name: update_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: bilanturi; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bilanturi (
    id bigint NOT NULL,
    cui text NOT NULL,
    caen text,
    an_fiscal integer DEFAULT 2024,
    active_imobilizate numeric(15,2),
    active_circulante numeric(15,2),
    stocuri numeric(15,2),
    creante numeric(15,2),
    casa_conturi numeric(15,2),
    cheltuieli_avans numeric(15,2),
    datorii numeric(15,2),
    venituri_avans numeric(15,2),
    provizioane numeric(15,2),
    capitaluri_total numeric(15,2),
    capital_subscris numeric(15,2),
    patrimoniu_regie numeric(15,2),
    cifra_afaceri numeric(15,2),
    venituri_totale numeric(15,2),
    cheltuieli_totale numeric(15,2),
    profit_brut numeric(15,2),
    pierdere_bruta numeric(15,2),
    profit_net numeric(15,2),
    pierdere_neta numeric(15,2),
    numar_angajati integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: bilant_2024_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bilant_2024_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bilant_2024_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bilant_2024_id_seq OWNED BY public.bilanturi.id;


--
-- Name: blog_authors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_authors (
    id integer NOT NULL,
    nume character varying(100) NOT NULL,
    prenume character varying(100) NOT NULL,
    slug character varying(200) NOT NULL,
    bio text,
    job_title character varying(150),
    avatar_url character varying(500),
    email character varying(254),
    website character varying(500),
    linkedin_url character varying(500),
    twitter_handle character varying(100),
    posts_count integer DEFAULT 0,
    total_views integer DEFAULT 0,
    active boolean DEFAULT true,
    featured boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE blog_authors; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.blog_authors IS 'Blog post authors with profile information';


--
-- Name: COLUMN blog_authors.slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.blog_authors.slug IS 'URL slug for author archive (e.g., "ion-popescu")';


--
-- Name: COLUMN blog_authors.posts_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.blog_authors.posts_count IS 'Cached count of published posts (auto-updated by trigger)';


--
-- Name: blog_authors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blog_authors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blog_authors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blog_authors_id_seq OWNED BY public.blog_authors.id;


--
-- Name: blog_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_categories (
    id integer NOT NULL,
    name character varying(150) NOT NULL,
    slug character varying(200) NOT NULL,
    description text,
    parent_id integer,
    path text,
    level integer DEFAULT 0,
    meta_title character varying(255),
    meta_description text,
    icon character varying(100),
    color character varying(7),
    featured boolean DEFAULT false,
    ordine integer DEFAULT 0,
    posts_count integer DEFAULT 0,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE blog_categories; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.blog_categories IS 'Hierarchical blog categories with materialized path';


--
-- Name: COLUMN blog_categories.path; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.blog_categories.path IS 'Materialized path (e.g., "/siguranta/echipamente-cap/") for efficient hierarchy queries';


--
-- Name: COLUMN blog_categories.level; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.blog_categories.level IS '0 = root category, 1 = child, 2 = grandchild, etc.';


--
-- Name: COLUMN blog_categories.posts_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.blog_categories.posts_count IS 'Cached count of posts (auto-updated by trigger)';


--
-- Name: blog_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blog_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blog_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blog_categories_id_seq OWNED BY public.blog_categories.id;


--
-- Name: blog_post_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_post_tags (
    id integer NOT NULL,
    post_id integer NOT NULL,
    tag_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE blog_post_tags; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.blog_post_tags IS 'Many-to-many relationship between blog posts and tags';


--
-- Name: blog_post_tags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blog_post_tags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blog_post_tags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blog_post_tags_id_seq OWNED BY public.blog_post_tags.id;


--
-- Name: blog_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_posts (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    slug character varying(200) NOT NULL,
    excerpt text,
    content text NOT NULL,
    content_format character varying(20) DEFAULT 'html'::character varying,
    author_id integer NOT NULL,
    category_id integer,
    featured_image character varying(500),
    featured_image_alt text,
    thumbnail_url character varying(500),
    meta_title character varying(255),
    meta_description text,
    meta_keywords text[],
    og_image character varying(500),
    canonical_url character varying(500),
    status character varying(20) DEFAULT 'draft'::character varying,
    published_at timestamp with time zone,
    scheduled_at timestamp with time zone,
    featured boolean DEFAULT false,
    sticky boolean DEFAULT false,
    allow_comments boolean DEFAULT true,
    views_count integer DEFAULT 0,
    likes_count integer DEFAULT 0,
    shares_count integer DEFAULT 0,
    comments_count integer DEFAULT 0,
    read_time_minutes integer,
    related_products integer[],
    version integer DEFAULT 1,
    last_viewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT valid_content_format CHECK (((content_format)::text = ANY ((ARRAY['html'::character varying, 'markdown'::character varying, 'richtext'::character varying])::text[]))),
    CONSTRAINT valid_status CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'scheduled'::character varying, 'published'::character varying, 'archived'::character varying])::text[])))
);


--
-- Name: TABLE blog_posts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.blog_posts IS 'Blog posts with Romanian content, rich media, and SEO optimization';


--
-- Name: COLUMN blog_posts.content_format; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.blog_posts.content_format IS 'Content format: html, markdown, richtext';


--
-- Name: COLUMN blog_posts.sticky; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.blog_posts.sticky IS 'Pin to top of blog listing';


--
-- Name: COLUMN blog_posts.read_time_minutes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.blog_posts.read_time_minutes IS 'Auto-calculated based on word count (avg 200 words/min)';


--
-- Name: COLUMN blog_posts.related_products; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.blog_posts.related_products IS 'Array of product IDs for future e-commerce integration';


--
-- Name: blog_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blog_posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blog_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blog_posts_id_seq OWNED BY public.blog_posts.id;


--
-- Name: blog_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_tags (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(200) NOT NULL,
    posts_count integer DEFAULT 0,
    color character varying(7),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE blog_tags; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.blog_tags IS 'Flat tag structure for flexible post classification';


--
-- Name: COLUMN blog_tags.posts_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.blog_tags.posts_count IS 'Cached count of posts (auto-updated by trigger)';


--
-- Name: blog_tags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blog_tags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blog_tags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blog_tags_id_seq OWNED BY public.blog_tags.id;


--
-- Name: cms_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_blocks (
    id integer NOT NULL,
    block_key character varying(100) NOT NULL,
    block_type character varying(50) NOT NULL,
    title character varying(255),
    content text NOT NULL,
    settings jsonb,
    image_url character varying(500),
    video_url character varying(500),
    active boolean DEFAULT true,
    ordine integer DEFAULT 0,
    page_id integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT valid_block_type CHECK (((block_type)::text = ANY ((ARRAY['hero'::character varying, 'features'::character varying, 'testimonial'::character varying, 'faq'::character varying, 'cta'::character varying, 'gallery'::character varying, 'text'::character varying, 'html'::character varying, 'custom'::character varying])::text[])))
);


--
-- Name: TABLE cms_blocks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cms_blocks IS 'Reusable content blocks for dynamic page sections';


--
-- Name: COLUMN cms_blocks.block_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cms_blocks.block_key IS 'Unique key for programmatic access (e.g., "homepage_hero", "features_section")';


--
-- Name: COLUMN cms_blocks.block_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cms_blocks.block_type IS 'Block type: hero, features, testimonial, faq, cta, gallery, text, html, custom';


--
-- Name: COLUMN cms_blocks.settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cms_blocks.settings IS 'Flexible JSONB for block-specific configuration';


--
-- Name: COLUMN cms_blocks.ordine; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cms_blocks.ordine IS 'Display order within page/section';


--
-- Name: COLUMN cms_blocks.page_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cms_blocks.page_id IS 'NULL = global block, SET = page-specific block';


--
-- Name: cms_blocks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cms_blocks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cms_blocks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cms_blocks_id_seq OWNED BY public.cms_blocks.id;


--
-- Name: cms_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_media (
    id integer NOT NULL,
    filename character varying(255) NOT NULL,
    cdn_url character varying(500) NOT NULL,
    thumbnail_url character varying(500),
    webp_url character varying(500),
    file_type character varying(50) NOT NULL,
    mime_type character varying(100) NOT NULL,
    file_size integer,
    width integer,
    height integer,
    alt_text text,
    folder character varying(200) DEFAULT 'uncategorized'::character varying,
    tags text[],
    usage_count integer DEFAULT 0,
    last_used_at timestamp with time zone,
    title text,
    description text,
    caption text,
    cloudinary_id character varying(200),
    cloudinary_meta jsonb,
    uploaded_at timestamp with time zone DEFAULT now(),
    uploaded_by integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT valid_file_type CHECK (((file_type)::text = ANY ((ARRAY['image'::character varying, 'video'::character varying, 'document'::character varying, 'audio'::character varying])::text[])))
);


--
-- Name: TABLE cms_media; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cms_media IS 'Media library with Cloudinary CDN integration';


--
-- Name: COLUMN cms_media.cdn_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cms_media.cdn_url IS 'Cloudinary CDN URL (primary)';


--
-- Name: COLUMN cms_media.thumbnail_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cms_media.thumbnail_url IS 'Cloudinary thumbnail variant';


--
-- Name: COLUMN cms_media.webp_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cms_media.webp_url IS 'Cloudinary WebP variant for performance';


--
-- Name: COLUMN cms_media.usage_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cms_media.usage_count IS 'Number of references from pages/posts/products';


--
-- Name: COLUMN cms_media.cloudinary_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cms_media.cloudinary_id IS 'Cloudinary public_id for API operations';


--
-- Name: cms_media_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cms_media_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cms_media_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cms_media_id_seq OWNED BY public.cms_media.id;


--
-- Name: cms_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_pages (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    slug character varying(200) NOT NULL,
    content text NOT NULL,
    excerpt text,
    template character varying(50) DEFAULT 'default'::character varying,
    layout character varying(50) DEFAULT 'main'::character varying,
    parent_id integer,
    meta_title character varying(255),
    meta_description text,
    meta_keywords text[],
    og_image character varying(500),
    og_type character varying(50) DEFAULT 'website'::character varying,
    canonical_url character varying(500),
    status character varying(20) DEFAULT 'draft'::character varying,
    published_at timestamp with time zone,
    scheduled_at timestamp with time zone,
    featured boolean DEFAULT false,
    show_in_menu boolean DEFAULT true,
    menu_order integer DEFAULT 0,
    views_count integer DEFAULT 0,
    last_viewed_at timestamp with time zone,
    author_id integer,
    version integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT valid_layout CHECK (((layout)::text = ANY ((ARRAY['main'::character varying, 'full-width'::character varying, 'sidebar-left'::character varying, 'sidebar-right'::character varying])::text[]))),
    CONSTRAINT valid_status CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'scheduled'::character varying, 'published'::character varying, 'archived'::character varying])::text[]))),
    CONSTRAINT valid_template CHECK (((template)::text = ANY ((ARRAY['default'::character varying, 'homepage'::character varying, 'about'::character varying, 'services'::character varying, 'contact'::character varying, 'landing-page'::character varying])::text[])))
);


--
-- Name: TABLE cms_pages; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cms_pages IS 'Static CMS pages with Romanian content and SEO fields';


--
-- Name: COLUMN cms_pages.template; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cms_pages.template IS 'Astro template: default, homepage, about, services, contact, landing-page';


--
-- Name: COLUMN cms_pages.layout; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cms_pages.layout IS 'Page layout: main, full-width, sidebar-left, sidebar-right';


--
-- Name: COLUMN cms_pages.parent_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cms_pages.parent_id IS 'Parent page for hierarchical structure (e.g., Services > PPE Services)';


--
-- Name: COLUMN cms_pages.show_in_menu; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cms_pages.show_in_menu IS 'Display in main navigation menu';


--
-- Name: COLUMN cms_pages.menu_order; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cms_pages.menu_order IS 'Order in menu (lower = first)';


--
-- Name: cms_pages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cms_pages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cms_pages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cms_pages_id_seq OWNED BY public.cms_pages.id;


--
-- Name: cms_slugs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_slugs (
    id integer NOT NULL,
    slug character varying(200) NOT NULL,
    content_type character varying(50) NOT NULL,
    content_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE cms_slugs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cms_slugs IS 'Global slug registry to prevent URL collisions across content types';


--
-- Name: COLUMN cms_slugs.slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cms_slugs.slug IS 'URL slug (e.g., "despre-noi", "ghid-echipamente-ppe")';


--
-- Name: COLUMN cms_slugs.content_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cms_slugs.content_type IS 'Table name: cms_pages, blog_posts, blog_categories';


--
-- Name: COLUMN cms_slugs.content_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cms_slugs.content_id IS 'ID from respective content table';


--
-- Name: cms_slugs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cms_slugs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cms_slugs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cms_slugs_id_seq OWNED BY public.cms_slugs.id;


--
-- Name: coduri_caen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coduri_caen (
    id integer NOT NULL,
    cod_rev3 character varying(10) NOT NULL,
    denumire_rev3 text NOT NULL,
    sectiune character varying(1),
    diviziune character varying(2),
    grupa character varying(3),
    coduri_rev2 text[],
    domeniu_custom text,
    subdomeniu text,
    tags text[],
    descriere_detaliata text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: coduri_caen_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.coduri_caen_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: coduri_caen_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.coduri_caen_id_seq OWNED BY public.coduri_caen.id;


--
-- Name: company_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_profile (
    id integer NOT NULL,
    cui text NOT NULL,
    financial_score integer,
    financial_trend character varying(20),
    budget_per_employee numeric(10,2),
    years_analyzed integer,
    latest_fiscal_year integer,
    financial_confidence numeric(3,2),
    company_legal_status character varying(50),
    legal_risk_level character varying(20),
    last_legal_check_date timestamp with time zone,
    legal_check_source character varying(50),
    industry_segment text,
    caen_primary character varying(10),
    ppe_need_level character varying(20),
    company_size_tier character varying(20),
    size_match_score integer,
    years_in_business integer,
    communication_style character varying(50),
    core_values text[],
    digital_maturity character varying(50),
    current_focus_areas text[],
    culture_confidence numeric(3,2),
    avatar_fit_score integer,
    priority_tier character varying(20) DEFAULT 'cold'::character varying,
    tier_reasoning text,
    last_analyzed_at timestamp with time zone,
    data_completeness_pct integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    basic_fit_score integer,
    financial_fit_tier character varying(20)
);


--
-- Name: TABLE company_profile; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.company_profile IS 'Golden record pentru AI prospecting - combină date financiare, juridice, culture signals pentru scoring ICP';


--
-- Name: COLUMN company_profile.financial_trend; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_profile.financial_trend IS 'unknown dacă avem doar 1 an bilanț';


--
-- Name: COLUMN company_profile.budget_per_employee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_profile.budget_per_employee IS 'Estimat de AI bazat pe bilanț - buget probabil PPE/uniforme per angajat/an';


--
-- Name: COLUMN company_profile.current_focus_areas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_profile.current_focus_areas IS 'Buying signals din company_signals.topics - se refreshează la scanare (3 luni)';


--
-- Name: COLUMN company_profile.avatar_fit_score; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_profile.avatar_fit_score IS 'AI-calculated ICP fit score (0-100). Only populated for warm/hot leads. Used for sales prioritization and deep analysis.';


--
-- Name: COLUMN company_profile.priority_tier; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_profile.priority_tier IS 'Sales funnel position (comportamental, dinamic): cold=niciun engagement, warm=opened/clicked, hot=replied/interested, blacklist=risc/refuz';


--
-- Name: COLUMN company_profile.basic_fit_score; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_profile.basic_fit_score IS 'SQL-calculated fit score (0-100). Always present. Used for outreach decisions. Formula: Revenue(0-30) + Employees(0-20) + Industry(0-20) + Location(0-10) + Age(0-10) + Bilant(0-10)';


--
-- Name: company_profile_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.company_profile_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: company_profile_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.company_profile_id_seq OWNED BY public.company_profile.id;


--
-- Name: company_signals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_signals (
    id integer NOT NULL,
    cui text NOT NULL,
    tip_semnal character varying(50) NOT NULL,
    sursa character varying(100) NOT NULL,
    data_semnal timestamp with time zone NOT NULL,
    expires_at timestamp with time zone,
    url_sursa text,
    titlu text,
    continut text,
    imagine_url text,
    topics text[],
    keywords text[],
    sentiment character varying(20),
    relevance_score integer,
    engagement_metrics jsonb,
    status character varying(50) DEFAULT 'new'::character varying,
    used_in_outreach_at timestamp with time zone,
    outreach_campaign_id integer,
    icebreaker_generated text,
    lead_magnet_idea text,
    extracted_by character varying(50),
    extraction_cost numeric(10,4),
    raw_data jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE company_signals; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.company_signals IS 'Semnale digitale pentru icebreaker personalizat - social media, website, awards, job postings';


--
-- Name: COLUMN company_signals.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_signals.expires_at IS 'Auto-calculat la insert: data_semnal + 6 luni';


--
-- Name: COLUMN company_signals.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.company_signals.status IS 'new=unused, used=în outreach, expired=>6 luni, ignored=not relevant';


--
-- Name: company_signals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.company_signals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: company_signals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.company_signals_id_seq OWNED BY public.company_signals.id;


--
-- Name: contact_info; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_info (
    id integer NOT NULL,
    cui text NOT NULL,
    telefon_principal character varying(300),
    telefon_secundar character varying(300),
    email_general character varying(254),
    website character varying(500),
    facebook_url character varying(500),
    linkedin_url character varying(500),
    instagram_url character varying(500),
    sursa_enrichment text,
    data_verificare timestamp with time zone,
    status_validare character varying(50),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    serper_processed boolean DEFAULT false,
    enrichment_details jsonb
);


--
-- Name: contact_info_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.contact_info_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: contact_info_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.contact_info_id_seq OWNED BY public.contact_info.id;


--
-- Name: directus_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_access (
    id uuid NOT NULL,
    role uuid,
    "user" uuid,
    policy uuid NOT NULL,
    sort integer
);


--
-- Name: directus_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_activity (
    id integer NOT NULL,
    action character varying(45) NOT NULL,
    "user" uuid,
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ip character varying(50),
    user_agent text,
    collection character varying(64) NOT NULL,
    item character varying(255) NOT NULL,
    origin character varying(255)
);


--
-- Name: directus_activity_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.directus_activity_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: directus_activity_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.directus_activity_id_seq OWNED BY public.directus_activity.id;


--
-- Name: directus_collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_collections (
    collection character varying(64) NOT NULL,
    icon character varying(64),
    note text,
    display_template character varying(255),
    hidden boolean DEFAULT false NOT NULL,
    singleton boolean DEFAULT false NOT NULL,
    translations json,
    archive_field character varying(64),
    archive_app_filter boolean DEFAULT true NOT NULL,
    archive_value character varying(255),
    unarchive_value character varying(255),
    sort_field character varying(64),
    accountability character varying(255) DEFAULT 'all'::character varying,
    color character varying(255),
    item_duplication_fields json,
    sort integer,
    "group" character varying(64),
    collapse character varying(255) DEFAULT 'open'::character varying NOT NULL,
    preview_url character varying(255),
    versioning boolean DEFAULT false NOT NULL
);


--
-- Name: directus_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_comments (
    id uuid NOT NULL,
    collection character varying(64) NOT NULL,
    item character varying(255) NOT NULL,
    comment text NOT NULL,
    date_created timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    date_updated timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    user_created uuid,
    user_updated uuid
);


--
-- Name: directus_dashboards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_dashboards (
    id uuid NOT NULL,
    name character varying(255) NOT NULL,
    icon character varying(64) DEFAULT 'dashboard'::character varying NOT NULL,
    note text,
    date_created timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    user_created uuid,
    color character varying(255)
);


--
-- Name: directus_extensions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_extensions (
    enabled boolean DEFAULT true NOT NULL,
    id uuid NOT NULL,
    folder character varying(255) NOT NULL,
    source character varying(255) NOT NULL,
    bundle uuid
);


--
-- Name: directus_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_fields (
    id integer NOT NULL,
    collection character varying(64) NOT NULL,
    field character varying(64) NOT NULL,
    special character varying(64),
    interface character varying(64),
    options json,
    display character varying(64),
    display_options json,
    readonly boolean DEFAULT false NOT NULL,
    hidden boolean DEFAULT false NOT NULL,
    sort integer,
    width character varying(30) DEFAULT 'full'::character varying,
    translations json,
    note text,
    conditions json,
    required boolean DEFAULT false,
    "group" character varying(64),
    validation json,
    validation_message text,
    searchable boolean DEFAULT true NOT NULL
);


--
-- Name: directus_fields_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.directus_fields_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: directus_fields_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.directus_fields_id_seq OWNED BY public.directus_fields.id;


--
-- Name: directus_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_files (
    id uuid NOT NULL,
    storage character varying(255) NOT NULL,
    filename_disk character varying(255),
    filename_download character varying(255) NOT NULL,
    title character varying(255),
    type character varying(255),
    folder uuid,
    uploaded_by uuid,
    created_on timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    modified_by uuid,
    modified_on timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    charset character varying(50),
    filesize bigint,
    width integer,
    height integer,
    duration integer,
    embed character varying(200),
    description text,
    location text,
    tags text,
    metadata json,
    focal_point_x integer,
    focal_point_y integer,
    tus_id character varying(64),
    tus_data json,
    uploaded_on timestamp with time zone
);


--
-- Name: directus_flows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_flows (
    id uuid NOT NULL,
    name character varying(255) NOT NULL,
    icon character varying(64),
    color character varying(255),
    description text,
    status character varying(255) DEFAULT 'active'::character varying NOT NULL,
    trigger character varying(255),
    accountability character varying(255) DEFAULT 'all'::character varying,
    options json,
    operation uuid,
    date_created timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    user_created uuid
);


--
-- Name: directus_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_folders (
    id uuid NOT NULL,
    name character varying(255) NOT NULL,
    parent uuid
);


--
-- Name: directus_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_migrations (
    version character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: directus_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_notifications (
    id integer NOT NULL,
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(255) DEFAULT 'inbox'::character varying,
    recipient uuid NOT NULL,
    sender uuid,
    subject character varying(255) NOT NULL,
    message text,
    collection character varying(64),
    item character varying(255)
);


--
-- Name: directus_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.directus_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: directus_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.directus_notifications_id_seq OWNED BY public.directus_notifications.id;


--
-- Name: directus_operations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_operations (
    id uuid NOT NULL,
    name character varying(255),
    key character varying(255) NOT NULL,
    type character varying(255) NOT NULL,
    position_x integer NOT NULL,
    position_y integer NOT NULL,
    options json,
    resolve uuid,
    reject uuid,
    flow uuid NOT NULL,
    date_created timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    user_created uuid
);


--
-- Name: directus_panels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_panels (
    id uuid NOT NULL,
    dashboard uuid NOT NULL,
    name character varying(255),
    icon character varying(64) DEFAULT NULL::character varying,
    color character varying(10),
    show_header boolean DEFAULT false NOT NULL,
    note text,
    type character varying(255) NOT NULL,
    position_x integer NOT NULL,
    position_y integer NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    options json,
    date_created timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    user_created uuid
);


--
-- Name: directus_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_permissions (
    id integer NOT NULL,
    collection character varying(64) NOT NULL,
    action character varying(10) NOT NULL,
    permissions json,
    validation json,
    presets json,
    fields text,
    policy uuid NOT NULL
);


--
-- Name: directus_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.directus_permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: directus_permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.directus_permissions_id_seq OWNED BY public.directus_permissions.id;


--
-- Name: directus_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_policies (
    id uuid NOT NULL,
    name character varying(100) NOT NULL,
    icon character varying(64) DEFAULT 'badge'::character varying NOT NULL,
    description text,
    ip_access text,
    enforce_tfa boolean DEFAULT false NOT NULL,
    admin_access boolean DEFAULT false NOT NULL,
    app_access boolean DEFAULT false NOT NULL
);


--
-- Name: directus_presets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_presets (
    id integer NOT NULL,
    bookmark character varying(255),
    "user" uuid,
    role uuid,
    collection character varying(64),
    search character varying(100),
    layout character varying(100) DEFAULT 'tabular'::character varying,
    layout_query json,
    layout_options json,
    refresh_interval integer,
    filter json,
    icon character varying(64) DEFAULT 'bookmark'::character varying,
    color character varying(255)
);


--
-- Name: directus_presets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.directus_presets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: directus_presets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.directus_presets_id_seq OWNED BY public.directus_presets.id;


--
-- Name: directus_relations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_relations (
    id integer NOT NULL,
    many_collection character varying(64) NOT NULL,
    many_field character varying(64) NOT NULL,
    one_collection character varying(64),
    one_field character varying(64),
    one_collection_field character varying(64),
    one_allowed_collections text,
    junction_field character varying(64),
    sort_field character varying(64),
    one_deselect_action character varying(255) DEFAULT 'nullify'::character varying NOT NULL
);


--
-- Name: directus_relations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.directus_relations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: directus_relations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.directus_relations_id_seq OWNED BY public.directus_relations.id;


--
-- Name: directus_revisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_revisions (
    id integer NOT NULL,
    activity integer NOT NULL,
    collection character varying(64) NOT NULL,
    item character varying(255) NOT NULL,
    data json,
    delta json,
    parent integer,
    version uuid
);


--
-- Name: directus_revisions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.directus_revisions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: directus_revisions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.directus_revisions_id_seq OWNED BY public.directus_revisions.id;


--
-- Name: directus_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_roles (
    id uuid NOT NULL,
    name character varying(100) NOT NULL,
    icon character varying(64) DEFAULT 'supervised_user_circle'::character varying NOT NULL,
    description text,
    parent uuid
);


--
-- Name: directus_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_sessions (
    token character varying(64) NOT NULL,
    "user" uuid,
    expires timestamp with time zone NOT NULL,
    ip character varying(255),
    user_agent text,
    share uuid,
    origin character varying(255),
    next_token character varying(64)
);


--
-- Name: directus_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_settings (
    id integer NOT NULL,
    project_name character varying(100) DEFAULT 'Directus'::character varying NOT NULL,
    project_url character varying(255),
    project_color character varying(255) DEFAULT '#6644FF'::character varying NOT NULL,
    project_logo uuid,
    public_foreground uuid,
    public_background uuid,
    public_note text,
    auth_login_attempts integer DEFAULT 25,
    auth_password_policy character varying(100),
    storage_asset_transform character varying(7) DEFAULT 'all'::character varying,
    storage_asset_presets json,
    custom_css text,
    storage_default_folder uuid,
    basemaps json,
    mapbox_key character varying(255),
    module_bar json,
    project_descriptor character varying(100),
    default_language character varying(255) DEFAULT 'en-US'::character varying NOT NULL,
    custom_aspect_ratios json,
    public_favicon uuid,
    default_appearance character varying(255) DEFAULT 'auto'::character varying NOT NULL,
    default_theme_light character varying(255),
    theme_light_overrides json,
    default_theme_dark character varying(255),
    theme_dark_overrides json,
    report_error_url character varying(255),
    report_bug_url character varying(255),
    report_feature_url character varying(255),
    public_registration boolean DEFAULT false NOT NULL,
    public_registration_verify_email boolean DEFAULT true NOT NULL,
    public_registration_role uuid,
    public_registration_email_filter json,
    visual_editor_urls json,
    project_id uuid,
    mcp_enabled boolean DEFAULT false NOT NULL,
    mcp_allow_deletes boolean DEFAULT false NOT NULL,
    mcp_prompts_collection character varying(255) DEFAULT NULL::character varying,
    mcp_system_prompt_enabled boolean DEFAULT true NOT NULL,
    mcp_system_prompt text,
    project_owner character varying(255),
    project_usage character varying(255),
    org_name character varying(255),
    product_updates boolean,
    project_status character varying(255),
    ai_openai_api_key text,
    ai_anthropic_api_key text,
    ai_system_prompt text
);


--
-- Name: directus_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.directus_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: directus_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.directus_settings_id_seq OWNED BY public.directus_settings.id;


--
-- Name: directus_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_shares (
    id uuid NOT NULL,
    name character varying(255),
    collection character varying(64) NOT NULL,
    item character varying(255) NOT NULL,
    role uuid,
    password character varying(255),
    user_created uuid,
    date_created timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    date_start timestamp with time zone,
    date_end timestamp with time zone,
    times_used integer DEFAULT 0,
    max_uses integer
);


--
-- Name: directus_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_translations (
    id uuid NOT NULL,
    language character varying(255) NOT NULL,
    key character varying(255) NOT NULL,
    value text NOT NULL
);


--
-- Name: directus_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_users (
    id uuid NOT NULL,
    first_name character varying(50),
    last_name character varying(50),
    email character varying(128),
    password character varying(255),
    location character varying(255),
    title character varying(50),
    description text,
    tags json,
    avatar uuid,
    language character varying(255) DEFAULT NULL::character varying,
    tfa_secret character varying(255),
    status character varying(16) DEFAULT 'active'::character varying NOT NULL,
    role uuid,
    token character varying(255),
    last_access timestamp with time zone,
    last_page character varying(255),
    provider character varying(128) DEFAULT 'default'::character varying NOT NULL,
    external_identifier character varying(255),
    auth_data json,
    email_notifications boolean DEFAULT true,
    appearance character varying(255),
    theme_dark character varying(255),
    theme_light character varying(255),
    theme_light_overrides json,
    theme_dark_overrides json,
    text_direction character varying(255) DEFAULT 'auto'::character varying NOT NULL
);


--
-- Name: directus_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_versions (
    id uuid NOT NULL,
    key character varying(64) NOT NULL,
    name character varying(255),
    collection character varying(64) NOT NULL,
    item character varying(255) NOT NULL,
    hash character varying(255),
    date_created timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    date_updated timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    user_created uuid,
    user_updated uuid,
    delta json
);


--
-- Name: enrichment_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrichment_runs (
    id integer NOT NULL,
    cui text NOT NULL,
    enrichment_type character varying(50) NOT NULL,
    started_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    duration_seconds integer,
    api_provider character varying(50),
    api_cost numeric(10,4),
    tokens_used integer,
    status character varying(50) NOT NULL,
    records_processed integer,
    records_created integer,
    error_message text,
    input_params jsonb,
    output_data jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE enrichment_runs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.enrichment_runs IS 'Audit trail pentru toate operațiunile de enrichment - cost tracking, error logging, performance monitoring';


--
-- Name: enrichment_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.enrichment_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: enrichment_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.enrichment_runs_id_seq OWNED BY public.enrichment_runs.id;


--
-- Name: firme_ro; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.firme_ro (
    id bigint NOT NULL,
    denumire text NOT NULL,
    cui text NOT NULL,
    cod_inmatriculare text,
    data_inmatriculare date,
    euid text,
    forma_juridica text,
    tara text DEFAULT 'RO'::text,
    judet text,
    localitate text,
    strada text,
    nr_strada text,
    bloc text,
    scara text,
    etaj text,
    apartament text,
    cod_postal text,
    sector text,
    completare_adresa text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: firme_ro_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.firme_ro_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: firme_ro_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.firme_ro_id_seq OWNED BY public.firme_ro.id;


--
-- Name: hazards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hazards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    label character varying(100) NOT NULL
);


--
-- Name: industries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.industries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    label character varying(100) NOT NULL,
    icon character varying(100)
);


--
-- Name: lead_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_requests (
    id integer NOT NULL,
    source_page_id integer NOT NULL,
    source_url character varying(500) NOT NULL,
    utm_source character varying(100),
    utm_medium character varying(100),
    utm_campaign character varying(100),
    contact_name character varying(255) NOT NULL,
    contact_email character varying(255) NOT NULL,
    contact_phone character varying(50),
    company_name character varying(500),
    company_cui character varying(20),
    message text,
    product_id uuid,
    matched_company_id integer,
    is_enriched boolean DEFAULT false,
    enriched_at timestamp with time zone,
    status character varying(50) DEFAULT 'new'::character varying,
    priority character varying(20) DEFAULT 'medium'::character varying,
    assigned_to character varying(100),
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    contacted_at timestamp with time zone,
    qualified_at timestamp with time zone,
    converted_at timestamp with time zone,
    CONSTRAINT lead_requests_priority_check CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'urgent'::character varying])::text[]))),
    CONSTRAINT lead_requests_status_check CHECK (((status)::text = ANY ((ARRAY['new'::character varying, 'contacted'::character varying, 'qualified'::character varying, 'converted'::character varying, 'lost'::character varying])::text[])))
);


--
-- Name: TABLE lead_requests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.lead_requests IS 'Lead capture from website forms with automatic CRM enrichment';


--
-- Name: COLUMN lead_requests.source_page_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lead_requests.source_page_id IS 'CMS page where lead originated (cms_pages.id)';


--
-- Name: COLUMN lead_requests.company_cui; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lead_requests.company_cui IS 'CUI for automatic company lookup in firme_ro';


--
-- Name: COLUMN lead_requests.product_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lead_requests.product_id IS 'Product of interest if lead is product-specific (products.id UUID)';


--
-- Name: COLUMN lead_requests.matched_company_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lead_requests.matched_company_id IS 'Auto-matched company from firme_ro (firme_ro.id)';


--
-- Name: COLUMN lead_requests.is_enriched; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lead_requests.is_enriched IS 'TRUE if company found in firme_ro via CUI';


--
-- Name: COLUMN lead_requests.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lead_requests.status IS 'Lead lifecycle: new → contacted → qualified → converted/lost';


--
-- Name: COLUMN lead_requests.priority; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lead_requests.priority IS 'Sales priority: low, medium, high, urgent';


--
-- Name: lead_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lead_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lead_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lead_requests_id_seq OWNED BY public.lead_requests.id;


--
-- Name: outreach_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outreach_log (
    id integer NOT NULL,
    cui text NOT NULL,
    persoana_contact_id integer,
    campaign_round integer DEFAULT 1,
    attempt_number integer DEFAULT 1,
    outreach_date timestamp with time zone NOT NULL,
    next_followup_date timestamp with time zone,
    dospit_until timestamp with time zone,
    canal character varying(50) NOT NULL,
    subject text,
    message_body text,
    icebreaker_used text,
    lead_magnet_offered text,
    signal_id integer,
    response_received boolean DEFAULT false,
    response_type character varying(50),
    response_date timestamp with time zone,
    response_text text,
    status character varying(50) DEFAULT 'sent'::character varying,
    conversion_status character varying(50),
    next_action character varying(100),
    assigned_to character varying(100),
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE outreach_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.outreach_log IS 'Sales prospecting tracker - 3-4 attempts per round, auto-dospit after no response, tier updates based on engagement';


--
-- Name: COLUMN outreach_log.campaign_round; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.outreach_log.campaign_round IS 'Incrementat după fiecare perioadă de dospit (3 luni)';


--
-- Name: COLUMN outreach_log.dospit_until; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.outreach_log.dospit_until IS 'NULL = campanie activă, NOT NULL = în pauză până la această dată';


--
-- Name: outreach_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.outreach_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: outreach_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.outreach_log_id_seq OWNED BY public.outreach_log.id;


--
-- Name: persoane_contact; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.persoane_contact (
    id integer NOT NULL,
    cui text NOT NULL,
    nume character varying(100),
    prenume character varying(100),
    functie character varying(100),
    telefon_mobil character varying(100),
    email_personal character varying(254),
    linkedin_url character varying(500),
    status_lead character varying(50),
    ultima_interactiune timestamp with time zone,
    observatii text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: persoane_contact_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.persoane_contact_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: persoane_contact_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.persoane_contact_id_seq OWNED BY public.persoane_contact.id;


--
-- Name: product_benefits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_benefits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    benefit_text text NOT NULL,
    icon_name character varying(100)
);


--
-- Name: product_hazards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_hazards (
    product_id uuid NOT NULL,
    hazard_id uuid NOT NULL
);


--
-- Name: product_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    url text NOT NULL,
    type character varying(50) NOT NULL,
    alt_text character varying(255)
);


--
-- Name: product_industries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_industries (
    product_id uuid NOT NULL,
    industry_id uuid NOT NULL
);


--
-- Name: product_specs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_specs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    material character varying(255),
    standard character varying(255),
    protection_level character varying(255),
    weight character varying(100),
    sizes jsonb
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    description text NOT NULL,
    short_description text,
    category character varying(100) NOT NULL,
    featured boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: signal_scan_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signal_scan_log (
    id integer NOT NULL,
    cui text NOT NULL,
    last_scan_at timestamp with time zone NOT NULL,
    next_scan_at timestamp with time zone NOT NULL,
    scan_count integer DEFAULT 1,
    signals_found integer DEFAULT 0,
    scan_duration_seconds integer,
    scan_cost numeric(10,4),
    scan_status character varying(50),
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE signal_scan_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.signal_scan_log IS 'Tracking cadență scanare signals - prevent duplicate scans, enforce 3 luni interval';


--
-- Name: COLUMN signal_scan_log.next_scan_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.signal_scan_log.next_scan_at IS 'Calculat: last_scan_at + 3 luni';


--
-- Name: signal_scan_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.signal_scan_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: signal_scan_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.signal_scan_log_id_seq OWNED BY public.signal_scan_log.id;


--
-- Name: bilanturi id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bilanturi ALTER COLUMN id SET DEFAULT nextval('public.bilant_2024_id_seq'::regclass);


--
-- Name: blog_authors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_authors ALTER COLUMN id SET DEFAULT nextval('public.blog_authors_id_seq'::regclass);


--
-- Name: blog_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_categories ALTER COLUMN id SET DEFAULT nextval('public.blog_categories_id_seq'::regclass);


--
-- Name: blog_post_tags id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_post_tags ALTER COLUMN id SET DEFAULT nextval('public.blog_post_tags_id_seq'::regclass);


--
-- Name: blog_posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts ALTER COLUMN id SET DEFAULT nextval('public.blog_posts_id_seq'::regclass);


--
-- Name: blog_tags id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_tags ALTER COLUMN id SET DEFAULT nextval('public.blog_tags_id_seq'::regclass);


--
-- Name: cms_blocks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_blocks ALTER COLUMN id SET DEFAULT nextval('public.cms_blocks_id_seq'::regclass);


--
-- Name: cms_media id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_media ALTER COLUMN id SET DEFAULT nextval('public.cms_media_id_seq'::regclass);


--
-- Name: cms_pages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_pages ALTER COLUMN id SET DEFAULT nextval('public.cms_pages_id_seq'::regclass);


--
-- Name: cms_slugs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_slugs ALTER COLUMN id SET DEFAULT nextval('public.cms_slugs_id_seq'::regclass);


--
-- Name: coduri_caen id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coduri_caen ALTER COLUMN id SET DEFAULT nextval('public.coduri_caen_id_seq'::regclass);


--
-- Name: company_profile id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_profile ALTER COLUMN id SET DEFAULT nextval('public.company_profile_id_seq'::regclass);


--
-- Name: company_signals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_signals ALTER COLUMN id SET DEFAULT nextval('public.company_signals_id_seq'::regclass);


--
-- Name: contact_info id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_info ALTER COLUMN id SET DEFAULT nextval('public.contact_info_id_seq'::regclass);


--
-- Name: directus_activity id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_activity ALTER COLUMN id SET DEFAULT nextval('public.directus_activity_id_seq'::regclass);


--
-- Name: directus_fields id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_fields ALTER COLUMN id SET DEFAULT nextval('public.directus_fields_id_seq'::regclass);


--
-- Name: directus_notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_notifications ALTER COLUMN id SET DEFAULT nextval('public.directus_notifications_id_seq'::regclass);


--
-- Name: directus_permissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_permissions ALTER COLUMN id SET DEFAULT nextval('public.directus_permissions_id_seq'::regclass);


--
-- Name: directus_presets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_presets ALTER COLUMN id SET DEFAULT nextval('public.directus_presets_id_seq'::regclass);


--
-- Name: directus_relations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_relations ALTER COLUMN id SET DEFAULT nextval('public.directus_relations_id_seq'::regclass);


--
-- Name: directus_revisions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_revisions ALTER COLUMN id SET DEFAULT nextval('public.directus_revisions_id_seq'::regclass);


--
-- Name: directus_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_settings ALTER COLUMN id SET DEFAULT nextval('public.directus_settings_id_seq'::regclass);


--
-- Name: enrichment_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrichment_runs ALTER COLUMN id SET DEFAULT nextval('public.enrichment_runs_id_seq'::regclass);


--
-- Name: firme_ro id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firme_ro ALTER COLUMN id SET DEFAULT nextval('public.firme_ro_id_seq'::regclass);


--
-- Name: lead_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_requests ALTER COLUMN id SET DEFAULT nextval('public.lead_requests_id_seq'::regclass);


--
-- Name: outreach_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_log ALTER COLUMN id SET DEFAULT nextval('public.outreach_log_id_seq'::regclass);


--
-- Name: persoane_contact id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persoane_contact ALTER COLUMN id SET DEFAULT nextval('public.persoane_contact_id_seq'::regclass);


--
-- Name: signal_scan_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_scan_log ALTER COLUMN id SET DEFAULT nextval('public.signal_scan_log_id_seq'::regclass);


--
-- Name: bilanturi bilant_2024_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bilanturi
    ADD CONSTRAINT bilant_2024_pkey PRIMARY KEY (id);


--
-- Name: blog_authors blog_authors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_authors
    ADD CONSTRAINT blog_authors_pkey PRIMARY KEY (id);


--
-- Name: blog_authors blog_authors_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_authors
    ADD CONSTRAINT blog_authors_slug_key UNIQUE (slug);


--
-- Name: blog_categories blog_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_categories
    ADD CONSTRAINT blog_categories_pkey PRIMARY KEY (id);


--
-- Name: blog_categories blog_categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_categories
    ADD CONSTRAINT blog_categories_slug_key UNIQUE (slug);


--
-- Name: blog_post_tags blog_post_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_post_tags
    ADD CONSTRAINT blog_post_tags_pkey PRIMARY KEY (id);


--
-- Name: blog_posts blog_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_pkey PRIMARY KEY (id);


--
-- Name: blog_posts blog_posts_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_slug_key UNIQUE (slug);


--
-- Name: blog_tags blog_tags_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_tags
    ADD CONSTRAINT blog_tags_name_key UNIQUE (name);


--
-- Name: blog_tags blog_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_tags
    ADD CONSTRAINT blog_tags_pkey PRIMARY KEY (id);


--
-- Name: blog_tags blog_tags_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_tags
    ADD CONSTRAINT blog_tags_slug_key UNIQUE (slug);


--
-- Name: cms_blocks cms_blocks_block_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_blocks
    ADD CONSTRAINT cms_blocks_block_key_key UNIQUE (block_key);


--
-- Name: cms_blocks cms_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_blocks
    ADD CONSTRAINT cms_blocks_pkey PRIMARY KEY (id);


--
-- Name: cms_media cms_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_media
    ADD CONSTRAINT cms_media_pkey PRIMARY KEY (id);


--
-- Name: cms_pages cms_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_pages
    ADD CONSTRAINT cms_pages_pkey PRIMARY KEY (id);


--
-- Name: cms_pages cms_pages_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_pages
    ADD CONSTRAINT cms_pages_slug_key UNIQUE (slug);


--
-- Name: cms_slugs cms_slugs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_slugs
    ADD CONSTRAINT cms_slugs_pkey PRIMARY KEY (id);


--
-- Name: cms_slugs cms_slugs_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_slugs
    ADD CONSTRAINT cms_slugs_slug_key UNIQUE (slug);


--
-- Name: coduri_caen coduri_caen_cod_rev3_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coduri_caen
    ADD CONSTRAINT coduri_caen_cod_rev3_key UNIQUE (cod_rev3);


--
-- Name: coduri_caen coduri_caen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coduri_caen
    ADD CONSTRAINT coduri_caen_pkey PRIMARY KEY (id);


--
-- Name: company_profile company_profile_cui_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_profile
    ADD CONSTRAINT company_profile_cui_key UNIQUE (cui);


--
-- Name: company_profile company_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_profile
    ADD CONSTRAINT company_profile_pkey PRIMARY KEY (id);


--
-- Name: company_signals company_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_signals
    ADD CONSTRAINT company_signals_pkey PRIMARY KEY (id);


--
-- Name: contact_info contact_info_cui_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_info
    ADD CONSTRAINT contact_info_cui_key UNIQUE (cui);


--
-- Name: contact_info contact_info_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_info
    ADD CONSTRAINT contact_info_pkey PRIMARY KEY (id);


--
-- Name: directus_access directus_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_access
    ADD CONSTRAINT directus_access_pkey PRIMARY KEY (id);


--
-- Name: directus_activity directus_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_activity
    ADD CONSTRAINT directus_activity_pkey PRIMARY KEY (id);


--
-- Name: directus_collections directus_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_collections
    ADD CONSTRAINT directus_collections_pkey PRIMARY KEY (collection);


--
-- Name: directus_comments directus_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_comments
    ADD CONSTRAINT directus_comments_pkey PRIMARY KEY (id);


--
-- Name: directus_dashboards directus_dashboards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_dashboards
    ADD CONSTRAINT directus_dashboards_pkey PRIMARY KEY (id);


--
-- Name: directus_extensions directus_extensions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_extensions
    ADD CONSTRAINT directus_extensions_pkey PRIMARY KEY (id);


--
-- Name: directus_fields directus_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_fields
    ADD CONSTRAINT directus_fields_pkey PRIMARY KEY (id);


--
-- Name: directus_files directus_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_files
    ADD CONSTRAINT directus_files_pkey PRIMARY KEY (id);


--
-- Name: directus_flows directus_flows_operation_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_flows
    ADD CONSTRAINT directus_flows_operation_unique UNIQUE (operation);


--
-- Name: directus_flows directus_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_flows
    ADD CONSTRAINT directus_flows_pkey PRIMARY KEY (id);


--
-- Name: directus_folders directus_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_folders
    ADD CONSTRAINT directus_folders_pkey PRIMARY KEY (id);


--
-- Name: directus_migrations directus_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_migrations
    ADD CONSTRAINT directus_migrations_pkey PRIMARY KEY (version);


--
-- Name: directus_notifications directus_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_notifications
    ADD CONSTRAINT directus_notifications_pkey PRIMARY KEY (id);


--
-- Name: directus_operations directus_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_operations
    ADD CONSTRAINT directus_operations_pkey PRIMARY KEY (id);


--
-- Name: directus_operations directus_operations_reject_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_operations
    ADD CONSTRAINT directus_operations_reject_unique UNIQUE (reject);


--
-- Name: directus_operations directus_operations_resolve_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_operations
    ADD CONSTRAINT directus_operations_resolve_unique UNIQUE (resolve);


--
-- Name: directus_panels directus_panels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_panels
    ADD CONSTRAINT directus_panels_pkey PRIMARY KEY (id);


--
-- Name: directus_permissions directus_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_permissions
    ADD CONSTRAINT directus_permissions_pkey PRIMARY KEY (id);


--
-- Name: directus_policies directus_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_policies
    ADD CONSTRAINT directus_policies_pkey PRIMARY KEY (id);


--
-- Name: directus_presets directus_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_presets
    ADD CONSTRAINT directus_presets_pkey PRIMARY KEY (id);


--
-- Name: directus_relations directus_relations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_relations
    ADD CONSTRAINT directus_relations_pkey PRIMARY KEY (id);


--
-- Name: directus_revisions directus_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_revisions
    ADD CONSTRAINT directus_revisions_pkey PRIMARY KEY (id);


--
-- Name: directus_roles directus_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_roles
    ADD CONSTRAINT directus_roles_pkey PRIMARY KEY (id);


--
-- Name: directus_sessions directus_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_sessions
    ADD CONSTRAINT directus_sessions_pkey PRIMARY KEY (token);


--
-- Name: directus_settings directus_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_settings
    ADD CONSTRAINT directus_settings_pkey PRIMARY KEY (id);


--
-- Name: directus_shares directus_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_shares
    ADD CONSTRAINT directus_shares_pkey PRIMARY KEY (id);


--
-- Name: directus_translations directus_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_translations
    ADD CONSTRAINT directus_translations_pkey PRIMARY KEY (id);


--
-- Name: directus_users directus_users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_users
    ADD CONSTRAINT directus_users_email_unique UNIQUE (email);


--
-- Name: directus_users directus_users_external_identifier_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_users
    ADD CONSTRAINT directus_users_external_identifier_unique UNIQUE (external_identifier);


--
-- Name: directus_users directus_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_users
    ADD CONSTRAINT directus_users_pkey PRIMARY KEY (id);


--
-- Name: directus_users directus_users_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_users
    ADD CONSTRAINT directus_users_token_unique UNIQUE (token);


--
-- Name: directus_versions directus_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_versions
    ADD CONSTRAINT directus_versions_pkey PRIMARY KEY (id);


--
-- Name: enrichment_runs enrichment_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrichment_runs
    ADD CONSTRAINT enrichment_runs_pkey PRIMARY KEY (id);


--
-- Name: firme_ro firme_ro_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firme_ro
    ADD CONSTRAINT firme_ro_pkey PRIMARY KEY (id);


--
-- Name: hazards hazards_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hazards
    ADD CONSTRAINT hazards_name_unique UNIQUE (name);


--
-- Name: hazards hazards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hazards
    ADD CONSTRAINT hazards_pkey PRIMARY KEY (id);


--
-- Name: industries industries_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.industries
    ADD CONSTRAINT industries_name_unique UNIQUE (name);


--
-- Name: industries industries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.industries
    ADD CONSTRAINT industries_pkey PRIMARY KEY (id);


--
-- Name: lead_requests lead_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_requests
    ADD CONSTRAINT lead_requests_pkey PRIMARY KEY (id);


--
-- Name: outreach_log outreach_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_log
    ADD CONSTRAINT outreach_log_pkey PRIMARY KEY (id);


--
-- Name: persoane_contact persoane_contact_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persoane_contact
    ADD CONSTRAINT persoane_contact_pkey PRIMARY KEY (id);


--
-- Name: product_benefits product_benefits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_benefits
    ADD CONSTRAINT product_benefits_pkey PRIMARY KEY (id);


--
-- Name: product_hazards product_hazards_product_id_hazard_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_hazards
    ADD CONSTRAINT product_hazards_product_id_hazard_id_pk PRIMARY KEY (product_id, hazard_id);


--
-- Name: product_images product_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_pkey PRIMARY KEY (id);


--
-- Name: product_industries product_industries_product_id_industry_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_industries
    ADD CONSTRAINT product_industries_product_id_industry_id_pk PRIMARY KEY (product_id, industry_id);


--
-- Name: product_specs product_specs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_specs
    ADD CONSTRAINT product_specs_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_slug_unique UNIQUE (slug);


--
-- Name: signal_scan_log signal_scan_log_cui_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_scan_log
    ADD CONSTRAINT signal_scan_log_cui_key UNIQUE (cui);


--
-- Name: signal_scan_log signal_scan_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_scan_log
    ADD CONSTRAINT signal_scan_log_pkey PRIMARY KEY (id);


--
-- Name: cms_slugs unique_content_reference; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_slugs
    ADD CONSTRAINT unique_content_reference UNIQUE (content_type, content_id);


--
-- Name: firme_ro unique_cui; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firme_ro
    ADD CONSTRAINT unique_cui UNIQUE (cui);


--
-- Name: bilanturi unique_cui_an_fiscal; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bilanturi
    ADD CONSTRAINT unique_cui_an_fiscal UNIQUE (cui, an_fiscal);


--
-- Name: blog_post_tags unique_post_tag; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_post_tags
    ADD CONSTRAINT unique_post_tag UNIQUE (post_id, tag_id);


--
-- Name: company_signals unique_signal_per_url; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_signals
    ADD CONSTRAINT unique_signal_per_url UNIQUE (cui, url_sursa);


--
-- Name: directus_activity_timestamp_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX directus_activity_timestamp_index ON public.directus_activity USING btree ("timestamp");


--
-- Name: directus_revisions_activity_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX directus_revisions_activity_index ON public.directus_revisions USING btree (activity);


--
-- Name: directus_revisions_parent_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX directus_revisions_parent_index ON public.directus_revisions USING btree (parent);


--
-- Name: idx_authors_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_authors_active ON public.blog_authors USING btree (active) WHERE (active = true);


--
-- Name: idx_authors_featured; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_authors_featured ON public.blog_authors USING btree (featured) WHERE (featured = true);


--
-- Name: idx_authors_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_authors_name_trgm ON public.blog_authors USING gin (((((nume)::text || ' '::text) || (prenume)::text)) public.gin_trgm_ops);


--
-- Name: idx_authors_posts_count; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_authors_posts_count ON public.blog_authors USING btree (posts_count DESC);


--
-- Name: idx_authors_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_authors_slug ON public.blog_authors USING btree (slug);


--
-- Name: idx_bilant_angajati; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bilant_angajati ON public.bilanturi USING btree (numar_angajati);


--
-- Name: idx_bilant_caen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bilant_caen ON public.bilanturi USING btree (caen);


--
-- Name: idx_bilant_cifra_afaceri; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bilant_cifra_afaceri ON public.bilanturi USING btree (cifra_afaceri);


--
-- Name: idx_bilant_cui; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bilant_cui ON public.bilanturi USING btree (cui);


--
-- Name: idx_blocks_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocks_active ON public.cms_blocks USING btree (active) WHERE (active = true);


--
-- Name: idx_blocks_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocks_key ON public.cms_blocks USING btree (block_key);


--
-- Name: idx_blocks_ordine; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocks_ordine ON public.cms_blocks USING btree (page_id, ordine) WHERE (page_id IS NOT NULL);


--
-- Name: idx_blocks_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocks_page ON public.cms_blocks USING btree (page_id) WHERE (page_id IS NOT NULL);


--
-- Name: idx_blocks_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocks_type ON public.cms_blocks USING btree (block_type);


--
-- Name: idx_caen_denumire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_caen_denumire ON public.coduri_caen USING gin (denumire_rev3 public.gin_trgm_ops);


--
-- Name: idx_caen_domeniu; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_caen_domeniu ON public.coduri_caen USING btree (domeniu_custom);


--
-- Name: idx_caen_rev2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_caen_rev2 ON public.coduri_caen USING gin (coduri_rev2);


--
-- Name: idx_caen_sectiune; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_caen_sectiune ON public.coduri_caen USING btree (sectiune);


--
-- Name: idx_categories_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_active ON public.blog_categories USING btree (active) WHERE (active = true);


--
-- Name: idx_categories_featured; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_featured ON public.blog_categories USING btree (featured) WHERE (featured = true);


--
-- Name: idx_categories_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_level ON public.blog_categories USING btree (level);


--
-- Name: idx_categories_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_name_trgm ON public.blog_categories USING gin (name public.gin_trgm_ops);


--
-- Name: idx_categories_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_parent ON public.blog_categories USING btree (parent_id) WHERE (parent_id IS NOT NULL);


--
-- Name: idx_categories_path; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_path ON public.blog_categories USING btree (path) WHERE (path IS NOT NULL);


--
-- Name: idx_categories_posts_count; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_posts_count ON public.blog_categories USING btree (posts_count DESC);


--
-- Name: idx_categories_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_slug ON public.blog_categories USING btree (slug);


--
-- Name: idx_contact_serper_processed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_serper_processed ON public.contact_info USING btree (serper_processed) WHERE (serper_processed = false);


--
-- Name: idx_cui; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cui ON public.firme_ro USING btree (cui);


--
-- Name: idx_denumire_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_denumire_trgm ON public.firme_ro USING gin (denumire public.gin_trgm_ops);


--
-- Name: idx_enrichment_cost; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrichment_cost ON public.enrichment_runs USING btree (api_cost DESC) WHERE (api_cost IS NOT NULL);


--
-- Name: idx_enrichment_cui; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrichment_cui ON public.enrichment_runs USING btree (cui);


--
-- Name: idx_enrichment_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrichment_started ON public.enrichment_runs USING btree (started_at DESC);


--
-- Name: idx_enrichment_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrichment_status ON public.enrichment_runs USING btree (status);


--
-- Name: idx_enrichment_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enrichment_type ON public.enrichment_runs USING btree (enrichment_type);


--
-- Name: idx_forma_juridica; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forma_juridica ON public.firme_ro USING btree (forma_juridica);


--
-- Name: idx_judet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_judet ON public.firme_ro USING btree (judet);


--
-- Name: idx_lead_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_created ON public.lead_requests USING btree (created_at DESC);


--
-- Name: idx_lead_cui; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_cui ON public.lead_requests USING btree (company_cui) WHERE (company_cui IS NOT NULL);


--
-- Name: idx_lead_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_email ON public.lead_requests USING btree (contact_email);


--
-- Name: idx_lead_matched_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_matched_company ON public.lead_requests USING btree (matched_company_id) WHERE (matched_company_id IS NOT NULL);


--
-- Name: idx_lead_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_product ON public.lead_requests USING btree (product_id) WHERE (product_id IS NOT NULL);


--
-- Name: idx_lead_source_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_source_page ON public.lead_requests USING btree (source_page_id);


--
-- Name: idx_lead_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_status ON public.lead_requests USING btree (status);


--
-- Name: idx_localitate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_localitate ON public.firme_ro USING btree (localitate);


--
-- Name: idx_media_alt_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_alt_trgm ON public.cms_media USING gin (alt_text public.gin_trgm_ops) WHERE (alt_text IS NOT NULL);


--
-- Name: idx_media_cloudinary_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_cloudinary_id ON public.cms_media USING btree (cloudinary_id) WHERE (cloudinary_id IS NOT NULL);


--
-- Name: idx_media_filename_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_filename_trgm ON public.cms_media USING gin (filename public.gin_trgm_ops);


--
-- Name: idx_media_folder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_folder ON public.cms_media USING btree (folder);


--
-- Name: idx_media_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_tags ON public.cms_media USING gin (tags);


--
-- Name: idx_media_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_type ON public.cms_media USING btree (file_type);


--
-- Name: idx_media_uploaded; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_uploaded ON public.cms_media USING btree (uploaded_at DESC);


--
-- Name: idx_outreach_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outreach_campaign ON public.outreach_log USING btree (cui, campaign_round, attempt_number);


--
-- Name: idx_outreach_conversion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outreach_conversion ON public.outreach_log USING btree (conversion_status);


--
-- Name: idx_outreach_cui; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outreach_cui ON public.outreach_log USING btree (cui);


--
-- Name: idx_outreach_dospit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outreach_dospit ON public.outreach_log USING btree (dospit_until) WHERE (dospit_until IS NOT NULL);


--
-- Name: idx_outreach_next_followup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outreach_next_followup ON public.outreach_log USING btree (next_followup_date) WHERE (next_followup_date IS NOT NULL);


--
-- Name: idx_outreach_person; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outreach_person ON public.outreach_log USING btree (persoana_contact_id);


--
-- Name: idx_outreach_response; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outreach_response ON public.outreach_log USING btree (response_received, response_type);


--
-- Name: idx_outreach_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outreach_status ON public.outreach_log USING btree (status);


--
-- Name: idx_pages_content_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pages_content_trgm ON public.cms_pages USING gin (content public.gin_trgm_ops);


--
-- Name: idx_pages_featured; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pages_featured ON public.cms_pages USING btree (featured) WHERE (featured = true);


--
-- Name: idx_pages_menu; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pages_menu ON public.cms_pages USING btree (show_in_menu, menu_order) WHERE (show_in_menu = true);


--
-- Name: idx_pages_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pages_parent ON public.cms_pages USING btree (parent_id) WHERE (parent_id IS NOT NULL);


--
-- Name: idx_pages_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pages_published ON public.cms_pages USING btree (published_at DESC) WHERE ((status)::text = 'published'::text);


--
-- Name: idx_pages_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pages_status ON public.cms_pages USING btree (status);


--
-- Name: idx_pages_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pages_template ON public.cms_pages USING btree (template);


--
-- Name: idx_pages_title_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pages_title_trgm ON public.cms_pages USING gin (title public.gin_trgm_ops);


--
-- Name: idx_persoane_cui; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_persoane_cui ON public.persoane_contact USING btree (cui);


--
-- Name: idx_persoane_nume_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_persoane_nume_trgm ON public.persoane_contact USING gin (((((nume)::text || ' '::text) || (prenume)::text)) public.gin_trgm_ops);


--
-- Name: idx_persoane_status_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_persoane_status_lead ON public.persoane_contact USING btree (status_lead);


--
-- Name: idx_persoane_ultima_interactiune; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_persoane_ultima_interactiune ON public.persoane_contact USING btree (ultima_interactiune DESC);


--
-- Name: idx_post_tags_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_tags_post ON public.blog_post_tags USING btree (post_id);


--
-- Name: idx_post_tags_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_post_tags_tag ON public.blog_post_tags USING btree (tag_id);


--
-- Name: idx_posts_author; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_author ON public.blog_posts USING btree (author_id);


--
-- Name: idx_posts_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_category ON public.blog_posts USING btree (category_id) WHERE (category_id IS NOT NULL);


--
-- Name: idx_posts_content_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_content_trgm ON public.blog_posts USING gin (content public.gin_trgm_ops);


--
-- Name: idx_posts_featured; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_featured ON public.blog_posts USING btree (featured) WHERE (featured = true);


--
-- Name: idx_posts_listing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_listing ON public.blog_posts USING btree (status, published_at DESC, featured) WHERE ((status)::text = 'published'::text);


--
-- Name: idx_posts_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_published ON public.blog_posts USING btree (published_at DESC) WHERE ((status)::text = 'published'::text);


--
-- Name: idx_posts_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_slug ON public.blog_posts USING btree (slug);


--
-- Name: idx_posts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_status ON public.blog_posts USING btree (status);


--
-- Name: idx_posts_sticky; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_sticky ON public.blog_posts USING btree (sticky) WHERE (sticky = true);


--
-- Name: idx_posts_title_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_title_trgm ON public.blog_posts USING gin (title public.gin_trgm_ops);


--
-- Name: idx_posts_views; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_posts_views ON public.blog_posts USING btree (views_count DESC);


--
-- Name: idx_profile_avatar_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profile_avatar_score ON public.company_profile USING btree (avatar_fit_score DESC);


--
-- Name: idx_profile_basic_cold_leads; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profile_basic_cold_leads ON public.company_profile USING btree (basic_fit_score DESC, ppe_need_level) WHERE (((priority_tier)::text = 'cold'::text) AND (basic_fit_score >= 50));


--
-- Name: idx_profile_basic_score; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profile_basic_score ON public.company_profile USING btree (basic_fit_score DESC);


--
-- Name: idx_profile_cui; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profile_cui ON public.company_profile USING btree (cui);


--
-- Name: idx_profile_digital; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profile_digital ON public.company_profile USING btree (digital_maturity);


--
-- Name: idx_profile_legal_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profile_legal_status ON public.company_profile USING btree (company_legal_status);


--
-- Name: idx_profile_ppe_need; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profile_ppe_need ON public.company_profile USING btree (ppe_need_level);


--
-- Name: idx_profile_prospecting; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profile_prospecting ON public.company_profile USING btree (priority_tier, avatar_fit_score DESC, ppe_need_level) WHERE ((company_legal_status)::text = 'functionala'::text);


--
-- Name: idx_profile_size_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profile_size_tier ON public.company_profile USING btree (company_size_tier);


--
-- Name: idx_profile_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profile_tier ON public.company_profile USING btree (priority_tier);


--
-- Name: idx_scan_cui; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scan_cui ON public.signal_scan_log USING btree (cui);


--
-- Name: idx_scan_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scan_status ON public.signal_scan_log USING btree (scan_status);


--
-- Name: idx_signals_cui; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signals_cui ON public.company_signals USING btree (cui);


--
-- Name: idx_signals_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signals_data ON public.company_signals USING btree (data_semnal DESC);


--
-- Name: idx_signals_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signals_expires ON public.company_signals USING btree (expires_at) WHERE ((status)::text <> 'expired'::text);


--
-- Name: idx_signals_relevance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signals_relevance ON public.company_signals USING btree (relevance_score DESC) WHERE ((status)::text = 'new'::text);


--
-- Name: idx_signals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signals_status ON public.company_signals USING btree (status);


--
-- Name: idx_signals_tip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signals_tip ON public.company_signals USING btree (tip_semnal);


--
-- Name: idx_signals_topics; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signals_topics ON public.company_signals USING gin (topics);


--
-- Name: idx_slugs_content_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_slugs_content_id ON public.cms_slugs USING btree (content_type, content_id);


--
-- Name: idx_slugs_content_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_slugs_content_type ON public.cms_slugs USING btree (content_type);


--
-- Name: idx_tags_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tags_name_trgm ON public.blog_tags USING gin (name public.gin_trgm_ops);


--
-- Name: idx_tags_posts_count; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tags_posts_count ON public.blog_tags USING btree (posts_count DESC);


--
-- Name: idx_tags_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tags_slug ON public.blog_tags USING btree (slug);


--
-- Name: company_profile blacklist_insolvent_companies; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER blacklist_insolvent_companies BEFORE INSERT OR UPDATE OF company_legal_status ON public.company_profile FOR EACH ROW EXECUTE FUNCTION public.auto_blacklist_insolvent();


--
-- Name: blog_posts calculate_post_read_time; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER calculate_post_read_time BEFORE INSERT OR UPDATE OF content ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.calculate_read_time();


--
-- Name: blog_categories register_category_slug; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER register_category_slug AFTER INSERT OR UPDATE OF slug ON public.blog_categories FOR EACH ROW EXECUTE FUNCTION public.register_cms_slug();


--
-- Name: cms_pages register_page_slug; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER register_page_slug AFTER INSERT OR UPDATE OF slug ON public.cms_pages FOR EACH ROW EXECUTE FUNCTION public.register_cms_slug();


--
-- Name: blog_posts register_post_slug; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER register_post_slug AFTER INSERT OR UPDATE OF slug ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.register_cms_slug();


--
-- Name: company_signals set_signal_expiry; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_signal_expiry BEFORE INSERT ON public.company_signals FOR EACH ROW EXECUTE FUNCTION public.expire_old_signals();


--
-- Name: lead_requests trigger_enrich_lead; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_enrich_lead BEFORE INSERT OR UPDATE ON public.lead_requests FOR EACH ROW EXECUTE FUNCTION public.enrich_lead_with_cui();


--
-- Name: lead_requests trigger_lead_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_lead_updated_at BEFORE UPDATE ON public.lead_requests FOR EACH ROW EXECUTE FUNCTION public.update_timestamp();


--
-- Name: blog_posts update_author_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_author_count AFTER INSERT OR DELETE OR UPDATE OF author_id ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.update_author_posts_count();


--
-- Name: bilanturi update_bilanturi_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bilanturi_timestamp BEFORE UPDATE ON public.bilanturi FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


--
-- Name: blog_authors update_blog_authors_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_blog_authors_timestamp BEFORE UPDATE ON public.blog_authors FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


--
-- Name: blog_categories update_blog_categories_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_blog_categories_timestamp BEFORE UPDATE ON public.blog_categories FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


--
-- Name: blog_posts update_blog_posts_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_blog_posts_timestamp BEFORE UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


--
-- Name: blog_tags update_blog_tags_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_blog_tags_timestamp BEFORE UPDATE ON public.blog_tags FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


--
-- Name: blog_posts update_category_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_category_count AFTER INSERT OR DELETE OR UPDATE OF category_id ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.update_category_posts_count();


--
-- Name: cms_blocks update_cms_blocks_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_cms_blocks_timestamp BEFORE UPDATE ON public.cms_blocks FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


--
-- Name: cms_media update_cms_media_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_cms_media_timestamp BEFORE UPDATE ON public.cms_media FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


--
-- Name: cms_pages update_cms_pages_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_cms_pages_timestamp BEFORE UPDATE ON public.cms_pages FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


--
-- Name: cms_slugs update_cms_slugs_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_cms_slugs_timestamp BEFORE UPDATE ON public.cms_slugs FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


--
-- Name: coduri_caen update_coduri_caen_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_coduri_caen_timestamp BEFORE UPDATE ON public.coduri_caen FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


--
-- Name: company_profile update_company_profile_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_company_profile_timestamp BEFORE UPDATE ON public.company_profile FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


--
-- Name: company_signals update_company_signals_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_company_signals_timestamp BEFORE UPDATE ON public.company_signals FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


--
-- Name: contact_info update_contact_info_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_contact_info_timestamp BEFORE UPDATE ON public.contact_info FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


--
-- Name: firme_ro update_firme_ro_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_firme_ro_timestamp BEFORE UPDATE ON public.firme_ro FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


--
-- Name: outreach_log update_outreach_log_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_outreach_log_timestamp BEFORE UPDATE ON public.outreach_log FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


--
-- Name: persoane_contact update_persoane_contact_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_persoane_contact_timestamp BEFORE UPDATE ON public.persoane_contact FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


--
-- Name: signal_scan_log update_signal_scan_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_signal_scan_timestamp BEFORE UPDATE ON public.signal_scan_log FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();


--
-- Name: blog_post_tags update_tag_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tag_count AFTER INSERT OR DELETE ON public.blog_post_tags FOR EACH ROW EXECUTE FUNCTION public.update_tag_posts_count();


--
-- Name: blog_categories blog_categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_categories
    ADD CONSTRAINT blog_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.blog_categories(id) ON DELETE CASCADE;


--
-- Name: blog_post_tags blog_post_tags_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_post_tags
    ADD CONSTRAINT blog_post_tags_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.blog_posts(id) ON DELETE CASCADE;


--
-- Name: blog_post_tags blog_post_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_post_tags
    ADD CONSTRAINT blog_post_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.blog_tags(id) ON DELETE CASCADE;


--
-- Name: blog_posts blog_posts_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.blog_authors(id) ON DELETE RESTRICT;


--
-- Name: blog_posts blog_posts_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.blog_categories(id) ON DELETE SET NULL;


--
-- Name: cms_blocks cms_blocks_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_blocks
    ADD CONSTRAINT cms_blocks_page_id_fkey FOREIGN KEY (page_id) REFERENCES public.cms_pages(id) ON DELETE CASCADE;


--
-- Name: cms_pages cms_pages_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_pages
    ADD CONSTRAINT cms_pages_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.cms_pages(id) ON DELETE SET NULL;


--
-- Name: directus_access directus_access_policy_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_access
    ADD CONSTRAINT directus_access_policy_foreign FOREIGN KEY (policy) REFERENCES public.directus_policies(id) ON DELETE CASCADE;


--
-- Name: directus_access directus_access_role_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_access
    ADD CONSTRAINT directus_access_role_foreign FOREIGN KEY (role) REFERENCES public.directus_roles(id) ON DELETE CASCADE;


--
-- Name: directus_access directus_access_user_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_access
    ADD CONSTRAINT directus_access_user_foreign FOREIGN KEY ("user") REFERENCES public.directus_users(id) ON DELETE CASCADE;


--
-- Name: directus_collections directus_collections_group_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_collections
    ADD CONSTRAINT directus_collections_group_foreign FOREIGN KEY ("group") REFERENCES public.directus_collections(collection);


--
-- Name: directus_comments directus_comments_user_created_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_comments
    ADD CONSTRAINT directus_comments_user_created_foreign FOREIGN KEY (user_created) REFERENCES public.directus_users(id) ON DELETE SET NULL;


--
-- Name: directus_comments directus_comments_user_updated_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_comments
    ADD CONSTRAINT directus_comments_user_updated_foreign FOREIGN KEY (user_updated) REFERENCES public.directus_users(id);


--
-- Name: directus_dashboards directus_dashboards_user_created_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_dashboards
    ADD CONSTRAINT directus_dashboards_user_created_foreign FOREIGN KEY (user_created) REFERENCES public.directus_users(id) ON DELETE SET NULL;


--
-- Name: directus_files directus_files_folder_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_files
    ADD CONSTRAINT directus_files_folder_foreign FOREIGN KEY (folder) REFERENCES public.directus_folders(id) ON DELETE SET NULL;


--
-- Name: directus_files directus_files_modified_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_files
    ADD CONSTRAINT directus_files_modified_by_foreign FOREIGN KEY (modified_by) REFERENCES public.directus_users(id);


--
-- Name: directus_files directus_files_uploaded_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_files
    ADD CONSTRAINT directus_files_uploaded_by_foreign FOREIGN KEY (uploaded_by) REFERENCES public.directus_users(id);


--
-- Name: directus_flows directus_flows_user_created_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_flows
    ADD CONSTRAINT directus_flows_user_created_foreign FOREIGN KEY (user_created) REFERENCES public.directus_users(id) ON DELETE SET NULL;


--
-- Name: directus_folders directus_folders_parent_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_folders
    ADD CONSTRAINT directus_folders_parent_foreign FOREIGN KEY (parent) REFERENCES public.directus_folders(id);


--
-- Name: directus_notifications directus_notifications_recipient_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_notifications
    ADD CONSTRAINT directus_notifications_recipient_foreign FOREIGN KEY (recipient) REFERENCES public.directus_users(id) ON DELETE CASCADE;


--
-- Name: directus_notifications directus_notifications_sender_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_notifications
    ADD CONSTRAINT directus_notifications_sender_foreign FOREIGN KEY (sender) REFERENCES public.directus_users(id);


--
-- Name: directus_operations directus_operations_flow_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_operations
    ADD CONSTRAINT directus_operations_flow_foreign FOREIGN KEY (flow) REFERENCES public.directus_flows(id) ON DELETE CASCADE;


--
-- Name: directus_operations directus_operations_reject_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_operations
    ADD CONSTRAINT directus_operations_reject_foreign FOREIGN KEY (reject) REFERENCES public.directus_operations(id);


--
-- Name: directus_operations directus_operations_resolve_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_operations
    ADD CONSTRAINT directus_operations_resolve_foreign FOREIGN KEY (resolve) REFERENCES public.directus_operations(id);


--
-- Name: directus_operations directus_operations_user_created_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_operations
    ADD CONSTRAINT directus_operations_user_created_foreign FOREIGN KEY (user_created) REFERENCES public.directus_users(id) ON DELETE SET NULL;


--
-- Name: directus_panels directus_panels_dashboard_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_panels
    ADD CONSTRAINT directus_panels_dashboard_foreign FOREIGN KEY (dashboard) REFERENCES public.directus_dashboards(id) ON DELETE CASCADE;


--
-- Name: directus_panels directus_panels_user_created_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_panels
    ADD CONSTRAINT directus_panels_user_created_foreign FOREIGN KEY (user_created) REFERENCES public.directus_users(id) ON DELETE SET NULL;


--
-- Name: directus_permissions directus_permissions_policy_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_permissions
    ADD CONSTRAINT directus_permissions_policy_foreign FOREIGN KEY (policy) REFERENCES public.directus_policies(id) ON DELETE CASCADE;


--
-- Name: directus_presets directus_presets_role_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_presets
    ADD CONSTRAINT directus_presets_role_foreign FOREIGN KEY (role) REFERENCES public.directus_roles(id) ON DELETE CASCADE;


--
-- Name: directus_presets directus_presets_user_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_presets
    ADD CONSTRAINT directus_presets_user_foreign FOREIGN KEY ("user") REFERENCES public.directus_users(id) ON DELETE CASCADE;


--
-- Name: directus_revisions directus_revisions_activity_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_revisions
    ADD CONSTRAINT directus_revisions_activity_foreign FOREIGN KEY (activity) REFERENCES public.directus_activity(id) ON DELETE CASCADE;


--
-- Name: directus_revisions directus_revisions_parent_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_revisions
    ADD CONSTRAINT directus_revisions_parent_foreign FOREIGN KEY (parent) REFERENCES public.directus_revisions(id);


--
-- Name: directus_revisions directus_revisions_version_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_revisions
    ADD CONSTRAINT directus_revisions_version_foreign FOREIGN KEY (version) REFERENCES public.directus_versions(id) ON DELETE CASCADE;


--
-- Name: directus_roles directus_roles_parent_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_roles
    ADD CONSTRAINT directus_roles_parent_foreign FOREIGN KEY (parent) REFERENCES public.directus_roles(id);


--
-- Name: directus_sessions directus_sessions_share_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_sessions
    ADD CONSTRAINT directus_sessions_share_foreign FOREIGN KEY (share) REFERENCES public.directus_shares(id) ON DELETE CASCADE;


--
-- Name: directus_sessions directus_sessions_user_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_sessions
    ADD CONSTRAINT directus_sessions_user_foreign FOREIGN KEY ("user") REFERENCES public.directus_users(id) ON DELETE CASCADE;


--
-- Name: directus_settings directus_settings_project_logo_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_settings
    ADD CONSTRAINT directus_settings_project_logo_foreign FOREIGN KEY (project_logo) REFERENCES public.directus_files(id);


--
-- Name: directus_settings directus_settings_public_background_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_settings
    ADD CONSTRAINT directus_settings_public_background_foreign FOREIGN KEY (public_background) REFERENCES public.directus_files(id);


--
-- Name: directus_settings directus_settings_public_favicon_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_settings
    ADD CONSTRAINT directus_settings_public_favicon_foreign FOREIGN KEY (public_favicon) REFERENCES public.directus_files(id);


--
-- Name: directus_settings directus_settings_public_foreground_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_settings
    ADD CONSTRAINT directus_settings_public_foreground_foreign FOREIGN KEY (public_foreground) REFERENCES public.directus_files(id);


--
-- Name: directus_settings directus_settings_public_registration_role_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_settings
    ADD CONSTRAINT directus_settings_public_registration_role_foreign FOREIGN KEY (public_registration_role) REFERENCES public.directus_roles(id) ON DELETE SET NULL;


--
-- Name: directus_settings directus_settings_storage_default_folder_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_settings
    ADD CONSTRAINT directus_settings_storage_default_folder_foreign FOREIGN KEY (storage_default_folder) REFERENCES public.directus_folders(id) ON DELETE SET NULL;


--
-- Name: directus_shares directus_shares_collection_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_shares
    ADD CONSTRAINT directus_shares_collection_foreign FOREIGN KEY (collection) REFERENCES public.directus_collections(collection) ON DELETE CASCADE;


--
-- Name: directus_shares directus_shares_role_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_shares
    ADD CONSTRAINT directus_shares_role_foreign FOREIGN KEY (role) REFERENCES public.directus_roles(id) ON DELETE CASCADE;


--
-- Name: directus_shares directus_shares_user_created_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_shares
    ADD CONSTRAINT directus_shares_user_created_foreign FOREIGN KEY (user_created) REFERENCES public.directus_users(id) ON DELETE SET NULL;


--
-- Name: directus_users directus_users_role_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_users
    ADD CONSTRAINT directus_users_role_foreign FOREIGN KEY (role) REFERENCES public.directus_roles(id) ON DELETE SET NULL;


--
-- Name: directus_versions directus_versions_collection_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_versions
    ADD CONSTRAINT directus_versions_collection_foreign FOREIGN KEY (collection) REFERENCES public.directus_collections(collection) ON DELETE CASCADE;


--
-- Name: directus_versions directus_versions_user_created_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_versions
    ADD CONSTRAINT directus_versions_user_created_foreign FOREIGN KEY (user_created) REFERENCES public.directus_users(id) ON DELETE SET NULL;


--
-- Name: directus_versions directus_versions_user_updated_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_versions
    ADD CONSTRAINT directus_versions_user_updated_foreign FOREIGN KEY (user_updated) REFERENCES public.directus_users(id);


--
-- Name: bilanturi fk_bilanturi_firme; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bilanturi
    ADD CONSTRAINT fk_bilanturi_firme FOREIGN KEY (cui) REFERENCES public.firme_ro(cui) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED NOT VALID;


--
-- Name: contact_info fk_contact_firme; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_info
    ADD CONSTRAINT fk_contact_firme FOREIGN KEY (cui) REFERENCES public.firme_ro(cui) ON DELETE CASCADE;


--
-- Name: enrichment_runs fk_enrichment_firme; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrichment_runs
    ADD CONSTRAINT fk_enrichment_firme FOREIGN KEY (cui) REFERENCES public.firme_ro(cui) ON DELETE CASCADE;


--
-- Name: outreach_log fk_outreach_firme; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_log
    ADD CONSTRAINT fk_outreach_firme FOREIGN KEY (cui) REFERENCES public.firme_ro(cui) ON DELETE CASCADE;


--
-- Name: outreach_log fk_outreach_person; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_log
    ADD CONSTRAINT fk_outreach_person FOREIGN KEY (persoana_contact_id) REFERENCES public.persoane_contact(id) ON DELETE SET NULL;


--
-- Name: outreach_log fk_outreach_signal; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outreach_log
    ADD CONSTRAINT fk_outreach_signal FOREIGN KEY (signal_id) REFERENCES public.company_signals(id) ON DELETE SET NULL;


--
-- Name: persoane_contact fk_persoane_firme; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.persoane_contact
    ADD CONSTRAINT fk_persoane_firme FOREIGN KEY (cui) REFERENCES public.firme_ro(cui) ON DELETE CASCADE;


--
-- Name: company_profile fk_profile_firme; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_profile
    ADD CONSTRAINT fk_profile_firme FOREIGN KEY (cui) REFERENCES public.firme_ro(cui) ON DELETE CASCADE;


--
-- Name: signal_scan_log fk_scan_firme; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signal_scan_log
    ADD CONSTRAINT fk_scan_firme FOREIGN KEY (cui) REFERENCES public.firme_ro(cui) ON DELETE CASCADE;


--
-- Name: company_signals fk_signals_firme; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_signals
    ADD CONSTRAINT fk_signals_firme FOREIGN KEY (cui) REFERENCES public.firme_ro(cui) ON DELETE CASCADE;


--
-- Name: lead_requests lead_requests_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_requests
    ADD CONSTRAINT lead_requests_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: lead_requests lead_requests_source_page_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_requests
    ADD CONSTRAINT lead_requests_source_page_id_fkey FOREIGN KEY (source_page_id) REFERENCES public.cms_pages(id) ON DELETE RESTRICT;


--
-- Name: product_benefits product_benefits_product_id_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_benefits
    ADD CONSTRAINT product_benefits_product_id_products_id_fk FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_hazards product_hazards_hazard_id_hazards_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_hazards
    ADD CONSTRAINT product_hazards_hazard_id_hazards_id_fk FOREIGN KEY (hazard_id) REFERENCES public.hazards(id) ON DELETE CASCADE;


--
-- Name: product_hazards product_hazards_product_id_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_hazards
    ADD CONSTRAINT product_hazards_product_id_products_id_fk FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_images product_images_product_id_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_images
    ADD CONSTRAINT product_images_product_id_products_id_fk FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_industries product_industries_industry_id_industries_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_industries
    ADD CONSTRAINT product_industries_industry_id_industries_id_fk FOREIGN KEY (industry_id) REFERENCES public.industries(id) ON DELETE CASCADE;


--
-- Name: product_industries product_industries_product_id_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_industries
    ADD CONSTRAINT product_industries_product_id_products_id_fk FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_specs product_specs_product_id_products_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_specs
    ADD CONSTRAINT product_specs_product_id_products_id_fk FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict RPbaNngTBOHzI6twgvDbXEwAqiYWsT2HqLzXL0gp6OSLjlsdR59aMeYOvcfWffU

