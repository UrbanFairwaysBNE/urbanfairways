# Bay Controller - Electron App

This directory contains the Electron wrapper for the Bay Controller application.

## Building the Windows .exe

### Prerequisites
1. Node.js 18+ installed
2. The main web app built (`npm run build` in the root directory)

### Steps to Build

1. First, build the web app from the root directory:
   ```bash
   npm run build
   ```

2. Navigate to the electron directory:
   ```bash
   cd electron
   ```

3. Install Electron dependencies:
   ```bash
   npm install
   ```

4. Build the Windows executable:
   ```bash
   npm run build
   ```

5. The `.exe` installer will be in `electron/dist-electron/`

## Development

To run in development mode:

1. Start the web app dev server from root:
   ```bash
   npm run dev
   ```

2. In another terminal, run Electron:
   ```bash
   cd electron
   npm start
   ```

## Features

- **Password Protection**: App requires password "Holeinone1" to access
- **Bay Selection**: Select which bay (1-7) this controller manages
- **Booking Sync**: Pulls bookings from the venue platform in real-time
- **TAPO Plug Control**: Scans network for TAPO P110 smart plugs
- **Auto Power Control**: Turns on 3 minutes before booking, off when done
- **Back-to-back Handling**: Keeps plugs on between consecutive bookings
- **Customer Notifications**: 5-minute and 1-minute session warnings
- **System Tray**: Runs in background with tray icon
- **Auto-start**: Starts automatically with Windows

## Configuration

Settings are stored in localStorage:
- Selected bay number
- Assigned smart plugs
- Pre-start timing (default 3 minutes)

## Adding TAPO Icon

Place an `icon.ico` file in this directory for the app icon.
