from pathlib import Path
path = Path('server/services/analysisEngine.ts')
text = path.read_text()
old = "const currentSquad = userSquad.picks.map(pick => {\\r\\n      const player = allPlayers.find(p => p.id === pick.element);\\r\\n      if (!player) {\\r\\n        console.warn(`[analysis] Player data missing for element ${pick.element}`);\\r\\n      }\\r\\n\\r\\n      return {\\r\\n        ...pick,\\r\\n        player,\\r\\n        sellPrice: (pick.selling_price || player?.now_cost || 0) / 10,\\r\\n      };\\r\\n    });"
new = """const currentSquad = userSquad.picks.map(pick => {\n      const player = allPlayers.find(p => p.id === pick.element);\n      if (!player) {\n        console.warn(`[analysis] Player data missing for element ${pick.element}`);\n      }\n\n      return {\n        ...pick,\n        player,\n        sellPrice: (pick.selling_price || player?.now_cost || 0) / 10,\n      };\n    });"""
if old not in text:
    raise SystemExit('pattern not found for currentSquad')
text = text.replace(old, new)
old2 = "const benchPlayers = filteredSquad.filter(p => p.position > 11);\\r\\n    const starterPlayers = filteredSquad.filter(p => p.position <= 11);\\r\\n\\r\\n    if (filteredSquad.length === 0) {\\r\\n      return {\\r\\n        bank,\\r\\n        teamValue,\\r\\n        freeTransfers,\\r\\n        nextDeadline,\\r\\n        maxPlayerPrice: bank,\\r\\n        benchUpgrades: [],\\r\\n        starterTargets: [],\\r\\n        riskAssessment: \"insufficient-data\",\\r\\n      };\\r\\n    }"
new2 = """const benchPlayers = filteredSquad.filter(p => p.position > 11);\n    const starterPlayers = filteredSquad.filter(p => p.position <= 11);\n\n    if (filteredSquad.length === 0) {\n      return {\n        bank,\n        teamValue,\n        freeTransfers,\n        nextDeadline,\n        maxPlayerPrice: bank,\n        benchUpgrades: [],\n        starterTargets: [],\n        riskAssessment: \"insufficient-data\",\n      };\n    }"""
if old2 not in text:
    raise SystemExit('pattern not found for benchPlayers')
text = text.replace(old2, new2)
old3 = "const maxSellValue = Math.max(...filteredSquad.map(p => p.sellPrice));"
if old3 not in text:
    raise SystemExit('pattern not found for maxSellValue')
text = text.replace(old3, old3)
path.write_text(text, encoding='utf-8')
