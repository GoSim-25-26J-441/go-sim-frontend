const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_BASE;

interface SimulationRequirements {
  nodes: number;
}

//Fetch designs list for a user
export const fetchDesignsList = async (userId: string) => {
  try {
    const response = await fetch(
      `${BASE_URL}/api/v1/analysis-suggestions/requests/user/${userId}`,
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
};

//Fetch cost data
export const fetchCostData = async (
  requestId: string,
  provider?: string,
  region?: string,
) => {
  try {
    const url = new URL(
      `${BASE_URL}/api/v1/analysis-suggestions/cost/${requestId}`,
    );
    if (provider && region) {
      url.searchParams.append("provider", provider);
      url.searchParams.append("region", region);
    }

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch costs: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
};

// Fetch all regions for a provide
export const fetchRegions = async (provider: string) => {
  try {
    const response = await fetch(
      `${BASE_URL}/api/v1/analysis-suggestions/cost/regions/${provider}`,
    );
    if (!response.ok) {
      throw new Error("Failed to fetch regions");
    }
    const data = await response.json();
    return data.regions || [];
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
};

// Fetch regions
export const fetchRegionsForRequest = async (
  requestId: string,
  provider: string,
) => {
  try {
    const response = await fetch(
      `${BASE_URL}/api/v1/analysis-suggestions/cost/${requestId}/regions/${provider}`,
    );
    if (!response.ok) {
      throw new Error("Failed to fetch regions for request");
    }
    const data = await response.json();
    return data.regions || [];
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
};

interface DesignRequirementsDTO {
  preferred_vcpu: number;
  preferred_memory_gb: number;
  workload: { concurrent_users: number };
  budget: number;
}

interface CandidateDTO {
  id: string;
  spec: {
    vcpu: number;
    memory_gb: number;
    label: string;
  };
  metrics: {
    cpu_util_pct: number;
    mem_util_pct: number;
  };
  sim_workload: {
    concurrent_users: number;
  };
  source: string;
}

// Fetch suggestions (project_id and run_id are required)
export const fetchSuggestions = async (
  userId: string,
  design: DesignRequirementsDTO,
  simulation: SimulationRequirements,
  candidates: CandidateDTO[],
  projectId: string,
  runId: string,
) => {
  try {
    const response = await fetch(
      `${BASE_URL}/api/v1/analysis-suggestions/suggest`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: userId,
          project_id: projectId,
          run_id: runId,
          design,
          simulation,
          candidates,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to get suggestions: ${response.status} ${response.statusText}`,
      );
    }

    return await response.json();
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
};

export const createDesignRequest = async (
  userId: string,
  projectId: string,
  runId: string,
  design: DesignRequirementsDTO,
) => {
  try {
    const response = await fetch(
      `${BASE_URL}/api/v1/analysis-suggestions/design`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: userId,
          project_id: projectId,
          run_id: runId,
          design,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to create design request: ${response.status} ${response.statusText}`,
      );
    }

    return await response.json();
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
};

// Fetch stored metrics analysis by id
export const fetchMetricsAnalysisById = async (id: string) => {
  try {
    const response = await fetch(
      `${BASE_URL}/api/v1/analysis-suggestions/requests/${id}`,
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch metrics analysis: ${response.status} ${response.statusText}`,
      );
    }

    return await response.json();
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
};

// Fetch the latest stored details
export const fetchDesignByProjectRun = async (
  userId: string,
  projectId: string,
  runId: string,
) => {
  try {
    const query = new URLSearchParams({
      user_id: userId,
      project_id: projectId,
      run_id: runId,
    });

    const response = await fetch(
      `${BASE_URL}/api/v1/analysis-suggestions/requests/by-project-run?${query.toString()}`,
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch design by project/run: ${response.status} ${response.statusText}`,
      );
    }

    return await response.json();
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
};

// Response from GET /api/v1/simulation/runs/:runId/candidates
export interface RunCandidatesResponse {
  best_candidate_id: string;
  candidates: RunCandidateItem[];
  project_id: string;
  run_id: string;
  simulation: { nodes: number };
  user_id: string;
}

export interface RunCandidateItem {
  id: string;
  spec: { label: string; memory_gb: number; vcpu: number };
  metrics: {
    cpu_util_pct: number;
    mem_util_pct: number;
    [key: string]: unknown;
  };
  sim_workload: { concurrent_users: number; rate_rps?: number };
  source: string;
  s3_path?: string;
}

// Fetch candidates for a simulation run
export const fetchRunCandidates = async (runId: string) => {
  try {
    const response = await fetch(
      `${BASE_URL}/api/v1/simulation/runs/${encodeURIComponent(runId)}/candidates`,
    );
    if (!response.ok) {
      throw new Error(
        `Failed to fetch run candidates: ${response.status} ${response.statusText}`,
      );
    }
    return (await response.json()) as RunCandidatesResponse;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
};

// Call suggest with run data
export const fetchSuggestionsFromRun = async (
  userId: string,
  projectId: string,
  runId: string,
  simulation: SimulationRequirements,
  candidates: CandidateDTO[],
) => {
  try {
    const response = await fetch(
      `${BASE_URL}/api/v1/analysis-suggestions/suggest`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: userId,
          project_id: projectId,
          run_id: runId,
          simulation,
          candidates,
        }),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Failed to get suggestions: ${response.status} ${response.statusText}`,
      );
    }
    return await response.json();
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
};
