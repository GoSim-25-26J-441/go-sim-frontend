"use client";

import Card1 from "@/components/common/card/page";

const point = [
  "Architecture graph view",
  "Anti-pattern warnings",
  "Simulation & cost insights",
];

export default function SectionBottom() {
  return (
    <div className="flex flex-col justify-start">
      <h1 className="text-2xl font-bold text-white">
        {"Visualize and test your microservices"}
      </h1>
      <p className="mt-3 text-xs font-normal text-[#7D7F86]">
        {
          "Turn YAML/JSON into architecture graphs, detect anti-patterns, and simulate performance before you deploy."
        }
      </p>
      <div className="px-10">
      <Card1 points={point} />
      </div>
    </div>
  );
}
