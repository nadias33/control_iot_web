# Sistema Telemático de Control y Monitoreo IoT 🚜📡🎮

Plataforma web modular, responsiva y diseñada bajo la filosofía **Mobile First** con diseño tipo **Gamepad Cyber Blue** para el control y monitoreo en tiempo real de una excavadora IoT.

El sistema consume una arquitectura en la nube desplegada sobre **Amazon Web Services (AWS)** con **FastAPI** en Amazon EC2, persistencia en **Amazon RDS MySQL** mediante 21 Stored Procedures y canal bidireccional mediante **WebSocket Seguro (WSS)**.

---

## 🌐 Enlaces Oficiales de la Práctica

- **Aplicación Web en GitHub Pages:** [https://nadias33.github.io/control_iot_web/](https://nadias33.github.io/control_iot_web/)
- **Documentación Swagger UI (AWS EC2 HTTPS):** [https://52.202.139.21/docs](https://52.202.139.21/docs)
- **Canal WebSocket Seguro (WSS):** `wss://52.202.139.21/ws/vehiculos/1`
- **Repositorio de Código en GitHub:** [https://github.com/nadias33/control_iot_web](https://github.com/nadias33/control_iot_web)

---

## 🛠️ Tecnologías Empleadas

- **Frontend:** HTML5 Semántico, CSS3 Personalizado (Glassmorphism & Cyber Theme), Bootstrap 5.3.
- **Lógica de Cliente:** JavaScript Moderno (ES6+) estructurado en módulos nativos (`import` / `export`).
- **Comunicaciones:** Fetch API (`async / await`) con `AbortController` y WebSocket nativo (`wss://`).
- **Infraestructura Cloud:** Amazon EC2 (Windows Server 2025 Base con Uvicorn/HTTPS), Amazon RDS (MySQL 8.0).
- **Control de Versiones:** Git y GitHub Pages (despliegue estático sin servidor intermedio).

---

## 📁 Estructura Modular del Proyecto

```text
control_iot_frontend/
├── index.html                      # Estructura semántica: Barra de navegación, Control y Monitoreo
├── favicon.svg                     # Favicon vectorial original de telemetría IoT
├── css/
│   └── styles.css                  # Chasis de control remoto RC, efectos 3D y diseño responsivo
├── js/
│   ├── config.js                   # Configuración centralizada de URLs y constantes (sin secretos)
│   ├── app.js                      # Orquestador principal de eventos y navegación sin recarga
│   ├── api/
│   │   └── client.js               # Cliente HTTP modular con Fetch, timeouts y manejo de errores
│   ├── websocket/
│   │   └── wsManager.js            # Gestor unificado de sesión WSS con reconexión automática
│   ├── utils/
│   │   └── dateFormatter.js        # Normalizador de fechas y horas en zona local
│   └── components/
│       ├── joystick.js             # Mando analógico táctil y ratón con Pointer Events
│       ├── buttons.js              # Controlador de parada prioritaria (STOP) y herramientas
│       ├── demoControl.js          # Selección, arranque y cancelación de secuencias DEMO
│       ├── statusPanel.js          # Monitor de 3 indicadores de conectividad en tiempo real
│       └── monitoringView.js       # Tarjeta de último estado y tabla de 10 registros RDS
└── README.md                       # Documentación técnica y manual de pruebas