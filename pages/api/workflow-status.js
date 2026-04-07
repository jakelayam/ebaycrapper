export default async function handler(req, res) {
  const ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) return res.status(500).json({ error: 'GITHUB_TOKEN not set' });

  try {
    const response = await fetch(
      'https://api.github.com/repos/jakelayam/ebaycrapper/actions/workflows/scrape.yml/runs?per_page=1',
      {
        headers: {
          'Authorization': `Bearer ${ghToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    const data = await response.json();
    const run = data.workflow_runs?.[0];

    if (!run) return res.status(200).json({ status: 'unknown' });

    res.status(200).json({
      status: run.status,           // queued, in_progress, completed
      conclusion: run.conclusion,   // success, failure, null
      started: run.created_at,
      updated: run.updated_at,
      url: run.html_url,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
