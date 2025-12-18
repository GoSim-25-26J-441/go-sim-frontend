"use client";

import Card1 from "@/components/common/card/page";

const point = [
  "Create up to 3 projects",
  "Visual architecture graphs",
  "Core anti-pattern detection",
  "Try sample architectures for learning and demos",
];

export default function RightSection() {
  return (
    <div className="flex h-full flex-col justify-around items-end">
      <div className="">
        <h1 className="text-end text-2xl font-bold text-white">
          {"What you get with a free GO-SIM account ?"}
        </h1>
        <p className="text-end mt-3 text-sm font-normal text-white">
          {
            "Model your microservice architecture, visualize service graphs, detect anti-patterns, and run basic simulations on the Free plan."
          }
        </p>
        <div className="flex justify-end px-10">
          <Card1 points={point} />
        </div>
      </div>

      <p className="text-end mt-3 text-xs font-normal text-white/80">
        {"Built as a research project at SLIIT to help teams and students reason about microservice performance before deployment."}
      </p>
    </div>
  );
}
