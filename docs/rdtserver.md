# Conectar a rdtserver por SSH

## Datos

| | |
| --- | --- |
| Máquina | rdtserver (Ubuntu 24.04) |
| Dirección | `192.168.1.45` (red local) |
| Puerto SSH | `3322`, no el 22 |
| Usuario | `kayadmin` |
| Clave | `~/.ssh/linea_deploy` |

La clave es `linea_deploy`, aunque el nombre venga de otro proyecto. Es la única de las claves del Mac que el servidor acepta; con `id_ed25519` e `id_ed25519_own` responde `Permission denied`.

## Conectar

```bash
ssh -p 3322 -i ~/.ssh/linea_deploy -o IdentitiesOnly=yes kayadmin@192.168.1.45
```

- `-p 3322`: el puerto del servidor.
- `-i ~/.ssh/linea_deploy`: la clave que acepta.
- `-o IdentitiesOnly=yes`: usa solo esa clave. Sin esta opción, SSH prueba antes las demás y el servidor puede cortar por demasiados intentos fallidos.

Para ejecutar un solo comando sin abrir sesión, se añade al final:

```bash
ssh -p 3322 -i ~/.ssh/linea_deploy -o IdentitiesOnly=yes kayadmin@192.168.1.45 "hostname"
```

Debe responder `rdtserver`.

## Atajo opcional

Si añades esto a `~/.ssh/config`:

```
Host rdtserver
    HostName 192.168.1.45
    Port 3322
    User kayadmin
    IdentityFile ~/.ssh/linea_deploy
    IdentitiesOnly yes
```

basta con:

```bash
ssh rdtserver
```

El atajo también sirve para copiar archivos: `scp archivo rdtserver:` o `rsync -az carpeta/ rdtserver:destino/`.

## Copiar archivos sin el atajo

Con `rsync` hay que pasarle las mismas opciones de SSH con `-e`:

```bash
rsync -az -e "ssh -p 3322 -i ~/.ssh/linea_deploy -o IdentitiesOnly=yes" carpeta/ kayadmin@192.168.1.45:destino/
```

## Si falla

| Síntoma | Qué mirar |
| --- | --- |
| `Permission denied (publickey,password)` | Que se use `~/.ssh/linea_deploy` con `IdentitiesOnly=yes`, y que el servidor siga teniendo su parte pública en `~/.ssh/authorized_keys`. |
| `Connection refused` o se queda colgado | Que el puerto sea el 3322 y que estés en la red local (`192.168.1.x`). |
| `sudo` pide contraseña | Es lo normal: `kayadmin` no tiene sudo sin contraseña. |
