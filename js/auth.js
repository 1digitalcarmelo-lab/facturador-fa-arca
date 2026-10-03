import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL =
  "https://rkkulnehklzqqmffvaqz.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_tKfKztMCb7iwDEIUdrgszA_qzPSPLZo";

const PRODUCT_SLUG = "facturador-arca";
const SUITE_URL = "https://suite.digitalcarmelo.com/";
const WHATSAPP_URL =
  "https://wa.me/5491176508119?text=" +
  encodeURIComponent(
    "Hola Digital Carmelo 👋 Estoy viendo el Facturador ARCA de Digital Carmelo y quiero saber cómo puedo incorporarlo a mi cuenta."
  );
const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

const root =
  document.getElementById("dc-auth-root");

/* =========================================================
   ESTILOS AUTH V2 · DIGITAL CARMELO
========================================================= */

function injectStyles() {
  if (
    document.getElementById(
      "dc-auth-v2-styles"
    )
  ) {
    return;
  }

  const style =
    document.createElement("style");

  style.id = "dc-auth-v2-styles";

  style.textContent = `
    .dc-auth-pending .app-shell,
    .dc-auth-pending .dc-strip,
    .dc-auth-pending .suite-promo {
      visibility: hidden !important;
    }

    #dc-auth-root {
      position: fixed;
      inset: 0;
      z-index: 999999;
      width: 100vw;
      height: 100vh;
      font-family: Inter, Arial, sans-serif;
    }

    .dc-auth-screen {
      position: fixed;
      inset: 0;
      width: 100vw;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px 20px;
      background:
        radial-gradient(
          circle at top left,
          rgba(110,74,142,.14),
          transparent 35%
        ),
        linear-gradient(
          135deg,
          #090a28 0%,
          #111336 55%,
          #0b0c2b 100%
        );
      color: #fff;
      box-sizing: border-box;
    }

    .dc-auth-card {
      width: min(100%, 570px);
      padding: 42px 40px;
      border-radius: 24px;
      border:
        1px solid rgba(212,162,76,.48);
      background:
        rgba(20,22,53,.97);
      box-shadow:
        0 30px 80px rgba(0,0,0,.28);
      box-sizing: border-box;
    }

    .dc-auth-center {
      text-align: center;
    }

    .dc-auth-lock {
      display: block;
      margin-bottom: 16px;
      font-size: 32px;
      text-align: center;
    }

    .dc-auth-eyebrow {
      margin: 0 0 14px;
      color: #e8ba55;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: .17em;
      text-transform: uppercase;
      text-align: center;
    }

    .dc-product-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 18px;
      padding: 7px 12px;
      border:
        1px solid rgba(212,162,76,.28);
      border-radius: 999px;
      background:
        rgba(212,162,76,.08);
      color: #d9b85f;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .12em;
      text-transform: uppercase;
    }

    .dc-auth-title {
      margin: 0 auto 18px;
      max-width: 470px;
      color: #f2d188;
      font-family:
        Georgia,
        "Times New Roman",
        serif;
      font-size:
        clamp(32px, 5vw, 44px);
      line-height: 1.08;
      font-weight: 500;
      text-transform: uppercase;
      text-align: center;
    }

    .dc-auth-copy {
      max-width: 440px;
      margin: 0 auto 26px;
      color: #e4e4ec;
      font-size: 16px;
      line-height: 1.6;
      text-align: center;
    }

    .dc-auth-label {
      display: block;
      margin: 18px 0 8px;
      color: #fff;
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
    }

    .dc-auth-input {
      width: 100%;
      min-height: 52px;
      padding: 0 15px;
      border:
        1px solid rgba(255,255,255,.2);
      border-radius: 14px;
      outline: none;
      background: #0e102e;
      color: #fff;
      font: inherit;
      box-sizing: border-box;
    }

    .dc-auth-input:focus {
      border-color: #d4a24c;
      box-shadow:
        0 0 0 3px rgba(212,162,76,.12);
    }

    .dc-auth-button {
      width: 100%;
      min-height: 52px;
      margin-top: 22px;
      border: 0;
      border-radius: 14px;
      cursor: pointer;
      background:
        linear-gradient(
          135deg,
          #f2d188,
          #d4a24c
        );
      color: #090a28;
      font-size: 16px;
      font-weight: 800;
      box-sizing: border-box;
    }

    .dc-auth-button:hover {
      filter: brightness(1.05);
    }

    .dc-auth-button:disabled {
      opacity: .65;
      cursor: wait;
    }

    .dc-auth-cta,
    .dc-auth-cta:visited {
      display: flex;
      width: 100%;
      min-height: 54px;
      align-items: center;
      justify-content: center;
      margin-top: 28px;
      border-radius: 14px;
      background:
        linear-gradient(
          135deg,
          #f2d188,
          #d4a24c
        );
      color: #090a28 !important;
      font-size: 16px;
      font-weight: 800;
      text-decoration: none !important;
      box-sizing: border-box;
      box-shadow:
        0 14px 34px rgba(212,162,76,.16);
      transition:
        transform .15s ease,
        filter .15s ease;
    }

    .dc-auth-cta:hover {
      transform: translateY(-1px);
      filter: brightness(1.05);
    }

    .dc-auth-link,
    .dc-auth-link:visited {
      display: block;
      margin-top: 18px;
      color: #f0c75e !important;
      text-decoration: none !important;
      font-weight: 700;
      text-align: center;
      cursor: pointer;
    }

    .dc-auth-link:hover {
      text-decoration: underline !important;
    }

    .dc-auth-error {
      margin-top: 16px;
      padding: 12px 14px;
      border-radius: 12px;
      background:
        rgba(190,50,50,.13);
      border:
        1px solid rgba(255,120,120,.22);
      color: #ffd2d2;
      font-size: 14px;
      line-height: 1.4;
    }

    .dc-auth-account {
      margin: 18px 0 0;
      color: #aeb1c8;
      font-size: 13px;
      word-break: break-word;
      text-align: center;
    }

    /* =========================
       MI CUENTA
    ========================= */

    .dc-account {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 100000;
      font-family:
        Inter,
        Arial,
        sans-serif;
    }

    .dc-account__button {
      min-height: 42px;
      padding: 0 14px;
      border:
        1px solid rgba(212,162,76,.55);
      border-radius: 12px;
      background: #111336;
      color: #f2d188;
      font-weight: 800;
      cursor: pointer;
      box-shadow:
        0 10px 30px rgba(0,0,0,.18);
    }

    .dc-account__button:hover {
      background: #191c46;
    }

    .dc-account__panel {
      display: none;
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      width:
        min(
          320px,
          calc(100vw - 32px)
        );
      padding: 16px;
      border:
        1px solid rgba(212,162,76,.45);
      border-radius: 16px;
      background: #141635;
      color: #fff;
      box-shadow:
        0 20px 55px rgba(0,0,0,.3);
      box-sizing: border-box;
    }

    .dc-account.is-open
    .dc-account__panel {
      display: block;
    }

    .dc-account__label {
      margin: 0 0 5px;
      color: #aeb1c8;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .08em;
    }

    .dc-account__email {
      margin: 0 0 14px;
      color: #fff;
      font-size: 13px;
      line-height: 1.4;
      word-break: break-word;
    }

    .dc-account__link,
    .dc-account__logout {
      display: flex;
      width: 100%;
      min-height: 42px;
      align-items: center;
      justify-content: center;
      margin-top: 8px;
      border-radius: 10px;
      box-sizing: border-box;
      font-family: inherit;
      font-size: 13px;
      font-weight: 800;
      text-decoration: none;
      cursor: pointer;
    }

    .dc-account__link {
      border:
        1px solid rgba(255,255,255,.14);
      background: #0e102e;
      color: #f2d188;
    }

    .dc-account__link:hover {
      background: #181a40;
    }

    .dc-account__logout {
      border: 0;
      background:
        linear-gradient(
          135deg,
          #f2d188,
          #d4a24c
        );
      color: #090a28;
    }

    .dc-account__logout:hover {
      filter: brightness(1.05);
    }

    .dc-account__logout:disabled {
      opacity: .6;
      cursor: wait;
    }

    @media (max-width: 600px) {
      .dc-auth-card {
        padding: 30px 22px;
        border-radius: 20px;
      }

      .dc-auth-title {
        font-size:
          clamp(30px, 10vw, 38px);
      }

      .dc-account {
        top: 10px;
        right: 10px;
      }

      .dc-account__button {
        min-height: 38px;
        padding: 0 11px;
        font-size: 12px;
      }
    }
  `;

  document.head.appendChild(style);
}

/* =========================================================
   MI CUENTA
========================================================= */

function mountAccountMenu(
  email = ""
) {
  if (
    document.getElementById(
      "dc-account"
    )
  ) {
    return;
  }

  const wrapper =
    document.createElement("div");

  wrapper.id = "dc-account";
  wrapper.className =
    "dc-account";

  wrapper.innerHTML = `
    <button
      type="button"
      class="dc-account__button"
      id="dc-account-toggle"
    >
      👤 Mi cuenta
    </button>

    <div class="dc-account__panel">

      <p class="dc-account__label">
        Sesión iniciada como
      </p>

      <p
        class="dc-account__email"
        id="dc-account-email"
      ></p>

      <a
        class="dc-account__link"
        href="${SUITE_URL}"
      >
        Volver a la Suite
      </a>

      <button
        type="button"
        class="dc-account__logout"
        id="dc-account-logout"
      >
        Cerrar sesión
      </button>

    </div>
  `;

  document.body.appendChild(
    wrapper
  );

  const emailElement =
    document.getElementById(
      "dc-account-email"
    );

  if (emailElement) {
    emailElement.textContent =
      email ||
      "Usuario Digital Carmelo";
  }

  const toggle =
    document.getElementById(
      "dc-account-toggle"
    );

  const logout =
    document.getElementById(
      "dc-account-logout"
    );

  toggle?.addEventListener(
    "click",
    () => {
      wrapper.classList.toggle(
        "is-open"
      );
    }
  );

  logout?.addEventListener(
    "click",
    async () => {
      logout.disabled = true;
      logout.textContent =
        "Cerrando...";

      const { error } =
        await supabase.auth.signOut();

      if (error) {
        console.error(
          "Error cerrando sesión:",
          error
        );

        logout.disabled = false;
        logout.textContent =
          "Cerrar sesión";

        alert(
          "No pudimos cerrar la sesión. Intentá nuevamente."
        );

        return;
      }

      window.location.reload();
    }
  );

  document.addEventListener(
    "click",
    (event) => {
      if (
        !wrapper.contains(
          event.target
        )
      ) {
        wrapper.classList.remove(
          "is-open"
        );
      }
    }
  );
}

/* =========================================================
   DESBLOQUEAR APP
========================================================= */

function unlockApp(
  email = ""
) {
  document.body.classList.remove(
    "dc-auth-pending"
  );

  if (root) {
    root.innerHTML = "";
    root.style.display = "none";
  }

  mountAccountMenu(email);
}

/* =========================================================
   LOGIN
========================================================= */

function renderLogin(
  message = ""
) {
  if (!root) return;

  root.style.display = "block";

  root.innerHTML = `
    <div class="dc-auth-screen">
      <div class="dc-auth-card">

        <p class="dc-auth-eyebrow">
          DIGITAL CARMELO · SUITE POTENCIADORA
        </p>

        <h1 class="dc-auth-title">
          Facturador ARCA · Digital Carmelo
        </h1>

        <p class="dc-auth-copy">
          Ingresá con el email y la contraseña asociados
          a tu cuenta de Digital Carmelo.
        </p>

        <form id="dc-auth-form">

          <label
            class="dc-auth-label"
            for="dc-auth-email"
          >
            Email
          </label>

          <input
            class="dc-auth-input"
            id="dc-auth-email"
            type="email"
            autocomplete="email"
            required
          >

          <label
            class="dc-auth-label"
            for="dc-auth-password"
          >
            Contraseña
          </label>

          <input
            class="dc-auth-input"
            id="dc-auth-password"
            type="password"
            autocomplete="current-password"
            required
          >

          <button
            class="dc-auth-button"
            id="dc-auth-submit"
            type="submit"
          >
            Ingresar
          </button>

          ${
            message
              ? `
                <div class="dc-auth-error">
                  ${message}
                </div>
              `
              : ""
          }

        </form>

        <a
          class="dc-auth-link"
          href="${SUITE_URL}"
        >
          ← Volver a la Suite
        </a>

      </div>
    </div>
  `;

  const form =
    document.getElementById(
      "dc-auth-form"
    );

  form?.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const email =
        document
          .getElementById(
            "dc-auth-email"
          )
          .value
          .trim();

      const password =
        document
          .getElementById(
            "dc-auth-password"
          )
          .value;

      const button =
        document.getElementById(
          "dc-auth-submit"
        );

      button.disabled = true;
      button.textContent =
        "Ingresando...";

      const { error } =
        await supabase.auth
          .signInWithPassword({
            email,
            password,
          });

      if (error) {
        renderLogin(
          "No pudimos iniciar sesión. Revisá el email y la contraseña."
        );

        return;
      }

      await checkAccess();
    }
  );
}

/* =========================================================
   HERRAMIENTA DISPONIBLE PARA SUMAR
========================================================= */

function renderLocked(
  email = ""
) {
  if (!root) return;

  root.style.display = "block";

  root.innerHTML = `
    <div class="dc-auth-screen">

      <div
        class="
          dc-auth-card
          dc-auth-center
        "
      >

        <span class="dc-auth-lock">
          ✨
        </span>

        <p class="dc-auth-eyebrow">
          DIGITAL CARMELO · SUITE POTENCIADORA
        </p>

        <div class="dc-product-chip">
          FACTURADOR DIGITAL CARMELO
        </div>

        <h1 class="dc-auth-title">
          Seguí creando
        </h1>

        <p class="dc-auth-copy">
          Esta herramienta también forma parte del ecosistema
          Digital Carmelo. Podés incorporarla a tu cuenta cuando
          lo decidas y seguir creando con más posibilidades
          dentro de la Suite.
        </p>

        <a
  href="${WHATSAPP_URL}"
  class="dc-auth-cta"
  target="_blank"
  rel="noopener noreferrer"
>
  Quiero seguir creando
</a>

        <a
          class="dc-auth-link"
          href="${SUITE_URL}"
        >
          ← Volver a la Suite
        </a>

        ${
          email
            ? `
              <p class="dc-auth-account">
                Cuenta: ${email}
              </p>
            `
            : ""
        }

        <a
          href="#"
          id="dc-auth-other-account"
          class="dc-auth-link"
        >
          Ingresar con otra cuenta
        </a>

      </div>
    </div>
  `;

  document
    .getElementById(
      "dc-auth-other-account"
    )
    ?.addEventListener(
      "click",
      async (event) => {
        event.preventDefault();

        const { error } =
          await supabase.auth
            .signOut();

        if (error) {
          console.error(
            "Error cerrando sesión:",
            error
          );

          return;
        }

        renderLogin();
      }
    );
}

/* =========================================================
   VERIFICAR ACCESO
========================================================= */

async function checkAccess() {
  injectStyles();

  const {
    data: { session },
    error: sessionError,
  } =
    await supabase.auth
      .getSession();

  if (
    sessionError ||
    !session
  ) {
    renderLogin();
    return;
  }

  const { data, error } =
    await supabase.rpc(
      "get_my_product_access",
      {
        p_product_slug:
          PRODUCT_SLUG,
      }
    );

  if (error) {
    console.error(
      "Error verificando acceso:",
      error
    );

    renderLogin(
      "No pudimos verificar el acceso en este momento. Intentá nuevamente."
    );

    return;
  }

  const access =
    Array.isArray(data)
      ? data[0]
      : data;

  const allowed =
    access?.can_access === true &&
    [
      "product_full",
      "suite_full",
      "trial_active",
    ].includes(
      access?.access_state
    );

  if (allowed) {
    unlockApp(
      session.user.email
    );

    return;
  }

  renderLocked(
    session.user.email || ""
  );
}

checkAccess();
