-- ─────────────────────────────────────────────────────────────────────────────
-- Schéma Tenant MyClassLink — Appliqué dans chaque schéma school_xxx
-- Ce script est exécuté lors de la création d'une nouvelle école.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Utilisateurs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email            TEXT UNIQUE NOT NULL,
  password_hash    TEXT,
  first_name       TEXT NOT NULL,
  last_name        TEXT NOT NULL,
  phone            TEXT,
  avatar_url       TEXT,
  role             TEXT NOT NULL CHECK (role IN ('ADMIN','CENSOR','ACCOUNTANT','TEACHER','PARENT','STUDENT','STAFF')),
  is_active        BOOLEAN DEFAULT TRUE,
  email_verified   BOOLEAN DEFAULT FALSE,
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  two_factor_secret  TEXT,
  last_login_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Personnel : poste & accès par module (bloc idempotent) ──────────────────
-- Étend la contrainte de rôle pour les écoles existantes et ajoute les colonnes.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('ADMIN','CENSOR','ACCOUNTANT','TEACHER','PARENT','STUDENT','STAFF'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title       TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_modules TEXT[] DEFAULT '{}';

-- ─── Années scolaires ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS academic_years (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        TEXT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  is_current  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Trimestres ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS terms (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  academic_year_id TEXT NOT NULL REFERENCES academic_years(id),
  name             TEXT NOT NULL,
  term_order       INT NOT NULL,
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  report_card_date DATE
);

-- ─── Niveaux ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS levels (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name         TEXT NOT NULL,
  level_order  INT NOT NULL
);

-- ─── Filières / Séries ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS streams (
  id   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL
);

-- ─── Matières ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
  id   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  code TEXT NOT NULL
);

-- ─── Coefficients matière par niveau ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS level_subjects (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  level_id    TEXT NOT NULL REFERENCES levels(id),
  subject_id  TEXT NOT NULL REFERENCES subjects(id),
  coefficient NUMERIC(4,2) DEFAULT 1,
  UNIQUE(level_id, subject_id)
);

-- ─── Classes ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classes (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name             TEXT NOT NULL,
  level_id         TEXT NOT NULL REFERENCES levels(id),
  stream_id        TEXT REFERENCES streams(id),
  academic_year_id TEXT NOT NULL REFERENCES academic_years(id),
  max_students     INT DEFAULT 40,
  room             TEXT,
  head_teacher_id  TEXT
);

-- ─── Enseignants ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teachers (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     TEXT UNIQUE NOT NULL REFERENCES users(id),
  employee_id TEXT UNIQUE,
  specialty   TEXT,
  hire_date   DATE
);

ALTER TABLE classes DROP CONSTRAINT IF EXISTS fk_head_teacher;
ALTER TABLE classes ADD CONSTRAINT fk_head_teacher
  FOREIGN KEY (head_teacher_id) REFERENCES teachers(id);

-- ─── Attribution enseignant-matière-classe ───────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_subject_classes (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  teacher_id  TEXT NOT NULL REFERENCES teachers(id),
  subject_id  TEXT NOT NULL REFERENCES subjects(id),
  class_id    TEXT NOT NULL REFERENCES classes(id),
  UNIQUE(teacher_id, subject_id, class_id)
);

-- ─── Élèves ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id       TEXT UNIQUE NOT NULL REFERENCES users(id),
  student_id    TEXT UNIQUE NOT NULL,
  date_of_birth DATE,
  gender        TEXT,
  address       TEXT
);

-- ─── Parents ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parents (
  id      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id)
);

-- ─── Liaison parent-élève ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parent_students (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  parent_id  TEXT NOT NULL REFERENCES parents(id),
  student_id TEXT NOT NULL REFERENCES students(id),
  relation   TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  UNIQUE(parent_id, student_id)
);
-- Rendre relation nullable pour les tenants existants (migration idempotente)
DO $$ BEGIN
  ALTER TABLE parent_students ALTER COLUMN relation DROP NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;

-- ─── Inscriptions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enrollments (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id       TEXT NOT NULL REFERENCES students(id),
  class_id         TEXT NOT NULL REFERENCES classes(id),
  academic_year_id TEXT NOT NULL REFERENCES academic_years(id),
  enrolled_at      TIMESTAMPTZ DEFAULT NOW(),
  status           TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','TRANSFERRED','EXPELLED','GRADUATED')),
  UNIQUE(student_id, academic_year_id)
);

-- ─── Emploi du temps ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedules (
  id                        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  class_id                  TEXT NOT NULL REFERENCES classes(id),
  teacher_subject_class_id  TEXT NOT NULL REFERENCES teacher_subject_classes(id),
  day_of_week               INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 6),
  start_time                TEXT NOT NULL,
  end_time                  TEXT NOT NULL,
  room                      TEXT
);

-- ─── Notes ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grades (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id   TEXT NOT NULL REFERENCES students(id),
  subject_id   TEXT NOT NULL REFERENCES subjects(id),
  term_id      TEXT NOT NULL REFERENCES terms(id),
  type         TEXT NOT NULL CHECK (type IN ('DEVOIR','INTERROGATION','COMPOSITION','EXAM')),
  value        NUMERIC(5,2) NOT NULL,
  max_value    NUMERIC(5,2) DEFAULT 20,
  coefficient  NUMERIC(4,2) DEFAULT 1,
  comment      TEXT,
  published_at TIMESTAMPTZ,
  created_by   TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grades_student ON grades(student_id);
CREATE INDEX IF NOT EXISTS idx_grades_term ON grades(term_id);

-- ─── Présences ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendances (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id    TEXT NOT NULL REFERENCES students(id),
  term_id       TEXT NOT NULL REFERENCES terms(id),
  date          DATE NOT NULL,
  schedule_id   TEXT REFERENCES schedules(id),
  status        TEXT NOT NULL CHECK (status IN ('PRESENT','ABSENT','LATE','EXCUSED')),
  justified     BOOLEAN DEFAULT FALSE,
  justification TEXT,
  recorded_by   TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, date, schedule_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendances(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendances(date);

-- ─── Présence des enseignants ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_attendances (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  teacher_id    TEXT NOT NULL REFERENCES teachers(id),
  date          DATE NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('PRESENT','ABSENT','LATE','EXCUSED')),
  justified     BOOLEAN DEFAULT FALSE,
  justification TEXT,
  recorded_by   TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(teacher_id, date)
);

CREATE INDEX IF NOT EXISTS idx_teacher_attendance_date ON teacher_attendances(date);

-- ─── Cahier de texte ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lessons (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  schedule_id  TEXT NOT NULL REFERENCES schedules(id),
  subject_id   TEXT NOT NULL REFERENCES subjects(id),
  date         DATE NOT NULL,
  title        TEXT NOT NULL,
  content      TEXT,
  next_content TEXT,
  homework     TEXT,
  resources    JSONB,
  teacher_id   TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Devoirs ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assignments (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  class_id    TEXT NOT NULL REFERENCES classes(id),
  teacher_id  TEXT NOT NULL,
  subject_id  TEXT NOT NULL REFERENCES subjects(id),
  title       TEXT NOT NULL,
  description TEXT,
  attachments JSONB,
  due_date    TIMESTAMPTZ NOT NULL,
  max_score   NUMERIC(5,2),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Rendus de devoirs ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS submissions (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  assignment_id TEXT NOT NULL REFERENCES assignments(id),
  student_id    TEXT NOT NULL REFERENCES students(id),
  files         JSONB,
  submitted_at  TIMESTAMPTZ DEFAULT NOW(),
  score         NUMERIC(5,2),
  feedback      TEXT,
  graded_at     TIMESTAMPTZ,
  status        TEXT DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','GRADED','LATE')),
  UNIQUE(assignment_id, student_id)
);

-- ─── Types de frais ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_types (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        TEXT NOT NULL,
  amount      INT NOT NULL,
  is_optional BOOLEAN DEFAULT FALSE
);

-- ─── Paiements ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id   TEXT NOT NULL REFERENCES students(id),
  parent_id    TEXT REFERENCES parents(id),
  fee_type_id  TEXT NOT NULL REFERENCES fee_types(id),
  amount       INT NOT NULL,
  status       TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING','SUCCESS','FAILED','REFUNDED')),
  provider     TEXT,
  provider_ref TEXT,
  receipt      TEXT,
  paid_at      TIMESTAMPTZ,
  due_date     DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- ─── Messagerie ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sender_id    TEXT NOT NULL REFERENCES users(id),
  recipient_id TEXT NOT NULL REFERENCES users(id),
  subject      TEXT,
  body         TEXT NOT NULL,
  attachments  JSONB,
  read_at      TIMESTAMPTZ,
  student_id   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Annonces ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  author_id    TEXT NOT NULL,
  target_roles JSONB,
  class_id     TEXT REFERENCES classes(id),
  is_pinned    BOOLEAN DEFAULT FALSE,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Notifications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    TEXT NOT NULL REFERENCES users(id),
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  data       JSONB,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(user_id, read_at);

-- ─── Rendez-vous ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS appointments (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  teacher_id   TEXT NOT NULL REFERENCES teachers(id),
  parent_id    TEXT NOT NULL REFERENCES parents(id),
  student_id   TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration     INT DEFAULT 30,
  status       TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONFIRMED','CANCELLED','COMPLETED')),
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Audit log tenant ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     TEXT NOT NULL REFERENCES users(id),
  action      TEXT NOT NULL,
  resource    TEXT NOT NULL,
  resource_id TEXT,
  old_value   JSONB,
  new_value   JSONB,
  ip          TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- ─── Sanctions ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sanctions (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id  TEXT NOT NULL REFERENCES students(id),
  type        TEXT NOT NULL CHECK (type IN ('AVERTISSEMENT','BLAME','EXCLUSION_TEMP','RENVOI','AUTRE')),
  reason      TEXT NOT NULL,
  description TEXT,
  date        DATE NOT NULL,
  duration    INT,
  issued_by   TEXT NOT NULL REFERENCES users(id),
  notified    BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sanctions_student ON sanctions(student_id);

-- ─── Paramètres de l'école ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS school_settings (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  school_name       TEXT NOT NULL,
  logo_url          TEXT,
  address           TEXT,
  city              TEXT,
  phone             TEXT,
  email             TEXT,
  director_name     TEXT,
  director_signature TEXT,
  stamp_url         TEXT,
  grade_system      TEXT DEFAULT '20' CHECK (grade_system IN ('20','AF','COMPETENCES')),
  interior_rules_url TEXT,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Personnalisation (identité visuelle) ─────────────────────────────────────
-- Bloc idempotent : s'applique aussi aux écoles existantes lors d'un repair/migrate.
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS slogan          TEXT;
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS font_family     TEXT;
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS primary_color   TEXT;
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS secondary_color TEXT;

-- ─── Moyen de paiement propre à l'école (secrets chiffrés au repos) ───────────
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS payment_provider           TEXT;    -- 'GENIUSPAY' | 'CINETPAY' | NULL
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS payment_enabled            BOOLEAN DEFAULT FALSE;
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS payment_api_key_enc        TEXT;
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS payment_api_secret_enc     TEXT;
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS payment_site_id_enc        TEXT;    -- CinetPay (site_id)
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS payment_webhook_secret_enc TEXT;

-- ─── Conseil de classe ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS class_councils (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  class_id         TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  term_id          TEXT NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  academic_year_id TEXT REFERENCES academic_years(id),
  scheduled_at     TIMESTAMPTZ,
  held_at          TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'PLANNED'
                   CHECK (status IN ('PLANNED','IN_PROGRESS','COMPLETED')),
  president        TEXT,
  general_notes    TEXT,
  created_by       TEXT REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(class_id, term_id)
);
CREATE INDEX IF NOT EXISTS idx_councils_class  ON class_councils(class_id);
CREATE INDEX IF NOT EXISTS idx_councils_term   ON class_councils(term_id);

CREATE TABLE IF NOT EXISTS council_students (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  council_id      TEXT NOT NULL REFERENCES class_councils(id) ON DELETE CASCADE,
  student_id      TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  average         NUMERIC(5,2),
  rank            INT,
  decision        TEXT NOT NULL DEFAULT 'PASSAGE'
                  CHECK (decision IN (
                    'PASSAGE','REDOUBLEMENT','PASSAGE_CONDITIONNEL',
                    'EXCLUSION','FELICITATIONS','ENCOURAGEMENTS','TABLEAU_HONNEUR'
                  )),
  appreciation    TEXT,
  council_comment TEXT,
  absences_count  INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(council_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_council_students_council ON council_students(council_id);

-- ─── Inscriptions en ligne ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enrollment_applications (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  academic_year_id  TEXT REFERENCES academic_years(id),
  first_name        TEXT NOT NULL,
  last_name         TEXT NOT NULL,
  date_of_birth     DATE,
  gender            TEXT CHECK (gender IN ('M','F')),
  desired_level     TEXT,
  previous_school   TEXT,
  previous_average  NUMERIC(5,2),
  parent_name       TEXT NOT NULL,
  parent_phone      TEXT NOT NULL,
  parent_email      TEXT,
  parent_relation   TEXT DEFAULT 'PARENT',
  address           TEXT,
  notes             TEXT,
  status            TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','ACCEPTED','REJECTED','WAITLISTED')),
  reviewed_by       TEXT REFERENCES users(id),
  reviewed_at       TIMESTAMPTZ,
  review_notes      TEXT,
  submitted_at      TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_applications_status       ON enrollment_applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_academic_year ON enrollment_applications(academic_year_id);

-- ─── Bibliothèque ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS books (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title        TEXT NOT NULL,
  author       TEXT,
  isbn         TEXT UNIQUE,
  category     TEXT,
  quantity     INT NOT NULL DEFAULT 1,
  available    INT NOT NULL DEFAULT 1,
  location     TEXT,
  description  TEXT,
  cover_url    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_books_category ON books(category);

CREATE TABLE IF NOT EXISTS book_loans (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  book_id      TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  student_id   TEXT REFERENCES students(id),
  teacher_id   TEXT REFERENCES teachers(id),
  loaned_at    TIMESTAMPTZ DEFAULT NOW(),
  due_date     DATE NOT NULL,
  returned_at  TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'ACTIVE'
               CHECK (status IN ('ACTIVE','RETURNED','OVERDUE','LOST')),
  notes        TEXT
);
CREATE INDEX IF NOT EXISTS idx_loans_book    ON book_loans(book_id);
CREATE INDEX IF NOT EXISTS idx_loans_student ON book_loans(student_id);
CREATE INDEX IF NOT EXISTS idx_loans_status  ON book_loans(status);

-- ─── Cantine ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cafeteria_menus (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  week_start   DATE NOT NULL,
  day_of_week  INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 6),
  meal_type    TEXT NOT NULL DEFAULT 'LUNCH' CHECK (meal_type IN ('BREAKFAST','LUNCH','SNACK')),
  description  TEXT NOT NULL,
  price        NUMERIC(10,2),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(week_start, day_of_week, meal_type)
);

CREATE TABLE IF NOT EXISTS cafeteria_subscriptions (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  academic_year_id TEXT REFERENCES academic_years(id),
  meal_type    TEXT NOT NULL DEFAULT 'LUNCH',
  start_date   DATE NOT NULL,
  end_date     DATE,
  amount_paid  NUMERIC(10,2) DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'ACTIVE'
               CHECK (status IN ('ACTIVE','SUSPENDED','CANCELLED')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, academic_year_id, meal_type)
);
CREATE INDEX IF NOT EXISTS idx_cafeteria_sub_student ON cafeteria_subscriptions(student_id);

-- ─── Ressources & Salles ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resources (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'ROOM'
               CHECK (type IN ('ROOM','EQUIPMENT','VEHICLE','OTHER')),
  capacity     INT,
  location     TEXT,
  description  TEXT,
  is_available BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resource_bookings (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  resource_id  TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  booked_by    TEXT NOT NULL REFERENCES users(id),
  title        TEXT NOT NULL,
  booking_date DATE NOT NULL,
  start_time   TEXT NOT NULL,
  end_time     TEXT NOT NULL,
  purpose      TEXT,
  status       TEXT NOT NULL DEFAULT 'CONFIRMED'
               CHECK (status IN ('PENDING','CONFIRMED','CANCELLED')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bookings_resource ON resource_bookings(resource_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date     ON resource_bookings(booking_date);

-- ─── Sorties scolaires ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_trips (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title           TEXT NOT NULL,
  description     TEXT,
  destination     TEXT NOT NULL,
  trip_date       DATE NOT NULL,
  return_date     DATE,
  departure_time  TEXT,
  cost            NUMERIC(10,2) DEFAULT 0,
  max_participants INT,
  organizer_id    TEXT REFERENCES users(id),
  status          TEXT NOT NULL DEFAULT 'PLANNED'
                  CHECK (status IN ('PLANNED','CONFIRMED','CANCELLED','COMPLETED')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trip_class_links (
  trip_id   TEXT NOT NULL REFERENCES field_trips(id) ON DELETE CASCADE,
  class_id  TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (trip_id, class_id)
);

CREATE TABLE IF NOT EXISTS trip_authorizations (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  trip_id    TEXT NOT NULL REFERENCES field_trips(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_id  TEXT REFERENCES parents(id),
  status     TEXT NOT NULL DEFAULT 'PENDING'
             CHECK (status IN ('PENDING','AUTHORIZED','REFUSED')),
  signed_at  TIMESTAMPTZ,
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trip_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_auth_trip    ON trip_authorizations(trip_id);
CREATE INDEX IF NOT EXISTS idx_auth_student ON trip_authorizations(student_id);
-- Signature numérique du parent (image PNG encodée en base64) + horodatage de mise à jour
-- (colonne déjà utilisée par actions/trips.ts::authorizeTrip mais jamais déclarée — corrige un bug latent).
ALTER TABLE trip_authorizations ADD COLUMN IF NOT EXISTS signature_data TEXT;
ALTER TABLE trip_authorizations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ─── Alertes automatiques ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_rules (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  type         TEXT NOT NULL
               CHECK (type IN ('ABSENCE_THRESHOLD','GRADE_DROP','PAYMENT_OVERDUE','LATE_THRESHOLD')),
  threshold    NUMERIC(6,2) NOT NULL,
  notify_sms   BOOLEAN DEFAULT TRUE,
  notify_email BOOLEAN DEFAULT TRUE,
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(type)
);

CREATE TABLE IF NOT EXISTS alert_logs (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  rule_id      TEXT NOT NULL REFERENCES alert_rules(id),
  student_id   TEXT NOT NULL REFERENCES students(id),
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  value        NUMERIC(8,2),
  sent_sms     BOOLEAN DEFAULT FALSE,
  sent_email   BOOLEAN DEFAULT FALSE,
  message      TEXT
);

-- ─── Récompenses élèves ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rewards (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('FELICITATIONS','ENCOURAGEMENTS','TABLEAU_HONNEUR','PRIX','MENTION','AUTRE')),
  title        TEXT NOT NULL,
  description  TEXT,
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  term_id      TEXT REFERENCES terms(id),
  issued_by    TEXT NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rewards_student ON rewards(student_id);

-- ─── Convocations ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS convocations (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_id    TEXT REFERENCES parents(id),
  type         TEXT NOT NULL CHECK (type IN ('DISCIPLINAIRE','ACADEMIQUE','ADMINISTRATIF','AUTRE')),
  reason       TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  location     TEXT,
  status       TEXT NOT NULL DEFAULT 'PENDING'
               CHECK (status IN ('PENDING','CONFIRMED','COMPLETED','CANCELLED')),
  notes        TEXT,
  issued_by    TEXT NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_convocations_student ON convocations(student_id);

-- ─── Bourses & Réductions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scholarships (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id       TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  academic_year_id TEXT REFERENCES academic_years(id),
  type             TEXT NOT NULL CHECK (type IN ('BOURSE_ETAT','BOURSE_INTERNE','REDUCTION','EXONERATION','AIDE_SOCIALE')),
  label            TEXT NOT NULL,
  amount           NUMERIC(12,2),
  percentage       NUMERIC(5,2),
  reason           TEXT,
  status           TEXT NOT NULL DEFAULT 'ACTIVE'
                   CHECK (status IN ('ACTIVE','SUSPENDED','EXPIRED')),
  start_date       DATE,
  end_date         DATE,
  granted_by       TEXT REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scholarships_student ON scholarships(student_id);

-- ─── Quiz / QCM ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quizzes (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title        TEXT NOT NULL,
  description  TEXT,
  subject_id   TEXT REFERENCES subjects(id),
  class_id     TEXT REFERENCES classes(id),
  term_id      TEXT REFERENCES terms(id),
  created_by   TEXT NOT NULL REFERENCES users(id),
  time_limit   INT,
  max_attempts INT DEFAULT 1,
  is_published BOOLEAN DEFAULT FALSE,
  due_date     TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quizzes_class ON quizzes(class_id);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  quiz_id      TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question     TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'MCQ' CHECK (type IN ('MCQ','TRUE_FALSE','SHORT')),
  options      JSONB,
  correct      TEXT NOT NULL,
  points       NUMERIC(4,2) DEFAULT 1,
  order_num    INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_questions_quiz ON quiz_questions(quiz_id);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  quiz_id      TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  answers      JSONB,
  score        NUMERIC(6,2),
  max_score    NUMERIC(6,2),
  started_at   TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'IN_PROGRESS'
               CHECK (status IN ('IN_PROGRESS','SUBMITTED','GRADED'))
);
CREATE INDEX IF NOT EXISTS idx_attempts_quiz    ON quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_attempts_student ON quiz_attempts(student_id);

-- ─── Badges & XP ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_badges (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  badge_type   TEXT NOT NULL CHECK (badge_type IN (
                 'FIRST_QUIZ','PERFECT_SCORE','STREAK_7','STREAK_30',
                 'TOP_CLASS','TOP_SCHOOL','ASSIDUOUS','BOOKWORM',
                 'HELPER','CREATIVE','PROGRESS','CHAMPION')),
  earned_at    TIMESTAMPTZ DEFAULT NOW(),
  details      TEXT,
  UNIQUE(student_id, badge_type)
);
CREATE INDEX IF NOT EXISTS idx_badges_student ON student_badges(student_id);

CREATE TABLE IF NOT EXISTS student_xp (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  source       TEXT NOT NULL,
  points       INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_xp_student ON student_xp(student_id);

-- ─── To-do liste élève ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_todos (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  due_date     DATE,
  priority     TEXT NOT NULL DEFAULT 'MEDIUM'
               CHECK (priority IN ('LOW','MEDIUM','HIGH')),
  completed    BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_todos_student ON student_todos(student_id);

-- ─── Objectifs académiques ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_goals (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject_id   TEXT REFERENCES subjects(id),
  title        TEXT NOT NULL,
  target_value NUMERIC(5,2),
  current_value NUMERIC(5,2) DEFAULT 0,
  unit         TEXT DEFAULT 'points',
  deadline     DATE,
  status       TEXT NOT NULL DEFAULT 'ACTIVE'
               CHECK (status IN ('ACTIVE','ACHIEVED','ABANDONED')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_goals_student ON student_goals(student_id);

-- ─── Agenda scolaire ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agenda_events (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title        TEXT NOT NULL,
  description  TEXT,
  event_type   TEXT NOT NULL DEFAULT 'GENERAL'
               CHECK (event_type IN ('EXAM','HOLIDAY','MEETING','ACTIVITY','DEADLINE','GENERAL')),
  start_date   DATE NOT NULL,
  end_date     DATE,
  start_time   TEXT,
  end_time     TEXT,
  class_id     TEXT REFERENCES classes(id),
  all_classes  BOOLEAN DEFAULT FALSE,
  created_by   TEXT NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agenda_date  ON agenda_events(start_date);

-- ─── Examens (mode distinct de l'agenda générique) ─────────────────────────────
-- Un examen planifie une composition sur une matière précise (barème, coefficient,
-- salle), lié à un événement d'agenda pour rester visible dans le calendrier
-- partagé. Les notes saisies pour cet examen référencent exam_id (voir plus bas).
CREATE TABLE IF NOT EXISTS exams (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agenda_event_id TEXT REFERENCES agenda_events(id) ON DELETE SET NULL,
  class_id        TEXT NOT NULL REFERENCES classes(id),
  subject_id      TEXT NOT NULL REFERENCES subjects(id),
  term_id         TEXT NOT NULL REFERENCES terms(id),
  title           TEXT NOT NULL,
  exam_date       DATE NOT NULL,
  start_time      TEXT,
  end_time        TEXT,
  room            TEXT,
  max_value       NUMERIC(5,2) NOT NULL DEFAULT 20,
  coefficient     NUMERIC(4,2) NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','COMPLETED','CANCELLED')),
  created_by      TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exams_class_subject_term ON exams(class_id, subject_id, term_id);
CREATE INDEX IF NOT EXISTS idx_exams_date ON exams(exam_date);

ALTER TABLE grades ADD COLUMN IF NOT EXISTS exam_id TEXT REFERENCES exams(id) ON DELETE SET NULL;

-- ─── Journal des échanges avec l'assistant IA élève ────────────────────────────
-- Conservé intégralement (question + réponse) pour permettre une supervision
-- par l'administration — nécessaire pour un assistant IA destiné à des mineurs.
CREATE TABLE IF NOT EXISTS ai_chat_logs (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  student_id TEXT NOT NULL REFERENCES students(id),
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  flagged    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_chat_logs_student ON ai_chat_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_ai_chat_logs_flagged ON ai_chat_logs(flagged) WHERE flagged = TRUE;

-- ─── Abonnement parent MyClassLink (2000 FCFA/an/enfant) ───────────────────────
-- Distinct des frais de scolarité (table `payments`) : ceci finance l'accès à la
-- plateforme (MyClassLink), pas l'établissement — l'argent va sur le compte
-- global MyClassLink, jamais sur le compte de paiement de l'école.
CREATE TABLE IF NOT EXISTS parent_subscriptions (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  parent_id        TEXT NOT NULL REFERENCES parents(id),
  academic_year_id TEXT NOT NULL REFERENCES academic_years(id),
  children_count   INT NOT NULL,
  amount           NUMERIC(10,2) NOT NULL,
  status           TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SUCCESS','FAILED')),
  provider         TEXT,
  provider_ref     TEXT,
  paid_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(parent_id, academic_year_id)
);
CREATE INDEX IF NOT EXISTS idx_parent_sub_parent ON parent_subscriptions(parent_id);
CREATE INDEX IF NOT EXISTS idx_agenda_class ON agenda_events(class_id);

-- ─── Rendez-vous parent-enseignant ──────────────────────────────────────────
-- L'enseignant publie des créneaux disponibles ; un parent en réserve un pour
-- un de ses enfants. Annulation = passage à CANCELLED (jamais de suppression),
-- ce qui libère automatiquement le créneau pour une nouvelle réservation.
CREATE TABLE IF NOT EXISTS teacher_availability_slots (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  teacher_id  TEXT NOT NULL REFERENCES teachers(id),
  start_time  TIMESTAMPTZ NOT NULL,
  end_time    TIMESTAMPTZ NOT NULL,
  location    TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teacher_avail_teacher ON teacher_availability_slots(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_avail_start   ON teacher_availability_slots(start_time);

CREATE TABLE IF NOT EXISTS appointments (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slot_id      TEXT NOT NULL REFERENCES teacher_availability_slots(id),
  parent_id    TEXT NOT NULL REFERENCES parents(id),
  student_id   TEXT REFERENCES students(id),
  reason       TEXT,
  status       TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED','CANCELLED')),
  cancelled_by TEXT CHECK (cancelled_by IN ('PARENT','TEACHER')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_appointments_slot   ON appointments(slot_id);
CREATE INDEX IF NOT EXISTS idx_appointments_parent ON appointments(parent_id);
