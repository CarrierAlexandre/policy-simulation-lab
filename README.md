# Policy Simulation Lab

An illustrative, browser-based monetary-policy exercise. Players choose an interest-rate path and explore its effects on inflation and economic activity under three fictional scenarios.

The game uses public Smets–Wouters (2007) monetary-policy transmission responses exported through the [COPPs toolkit](https://github.com/COPPsToolkit/COPPs). Its scenarios, policy effects, preferences and scores are illustrative; they are not forecasts or policy recommendations.

## GitHub Pages

In this repository, open **Settings → Pages**. Under **Build and deployment**, select **Deploy from a branch**, then choose `main` and `/(root)`.

## Updating the leaderboard

Edit `data/leaderboard.json`. Each scenario contains a list of gametags and percentage-improvement scores:

```json
{
  "energy": [{"tag": "RATEHAWK", "score": 12.34}],
  "credit": [],
  "boom": []
}
```

The page sorts entries automatically. Use only the gametag recorded during the game—never add names, email addresses, rate paths or other personal information.
