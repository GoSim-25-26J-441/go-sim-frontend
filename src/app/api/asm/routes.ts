const BASE_URL = process.env.API_BASE || "http://localhost:8080/api/";

//Fetch designs list for a user
export const fetchDesignsList = async (userId: string) => {
  try {
    const response = await fetch(`${BASE_URL}requests/user/${userId}`);

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
  region?: string
) => {
  try {
    const url = new URL(`${BASE_URL}cost/${requestId}`);
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

//Fetch region data
export const fetchRegions = async (provider: string) => {
  try {
    const response = await fetch(`${BASE_URL}cost/regions/${provider}`);
    if (!response.ok) {
      throw new Error("Failed to fetch regions");
    }
    const data = await response.json();
    return data.regions || [];
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
};

// Fetch suggestions
export const fetchSuggestions = async (
  userId: string,
  design: any,
  simulation: SimulationRequirements,
  candidates: any[]
) => {
  try {
    const response = await fetch(`${BASE_URL}suggest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        design,
        simulation,
        candidates,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to get suggestions: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
};
