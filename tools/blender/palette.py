"""
Paleta de los personajes: la misma C de characters.ts, en rampas (luz, base, sombra).

Si cambia allí, hay que cambiarla aquí. Los modelos de sprites/ la importan para
que lo renderizado y lo dibujado compartan tonos.
"""

STEEL = (0xD8E0EA, 0xA8B2C0, 0x6A7484)
BLUE = (0x4A7AD0, 0x2F5AA8, 0x1F3A78)
RED = (0xE05040, 0xB02A2A, 0x7A1A1A)
LEATHER = (0xB07A48, 0x8A5A30, 0x5E3A1C)
GREEN = (0x5A9A48, 0x3A7A34, 0x24502A)
WHITE = (0xFAF6EA, 0xE0D8C4, 0xA89C84)
GOLD = (0xFFE08A, 0xD8A83A, 0x9A6A1A)
PANTS = (0x5A5A6A, 0x44444E, 0x2E2E38)
BOOTS = (0x7A5030, 0x5A3820, 0x3A2414)
WOOD = (0xA07040, 0x7A5030, 0x553418)
HAIR = (0xE0A050, 0xB87830, 0x7A4A1A)
# SKIN de characters.ts solo tiene base y sombra; la luz es propia de lo renderizado.
SKIN = (0xFFE0BC, 0xF2C8A0, 0xD8A078)
EYE = 0x2A1A1A
MOUTH = 0xC88070

# Como NO_GRAIN de characters.ts: piel, metal, blanco y oro se ven limpios, sin trama.
NO_GRAIN = {*SKIN, *STEEL, *WHITE, *GOLD, 0xE8E0D0, 0xF6F0E6}
