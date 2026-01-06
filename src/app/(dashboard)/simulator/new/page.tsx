"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Play, FileText } from "lucide-react";
import { InputField, TextAreaField } from "@/components/common/inputFeild/page";
import { createSimulationRun } from "@/lib/api-client/simulation";
import { SIMULATION_TEMPLATES, getTemplate } from "@/lib/simulation/templates";

interface SimulationFormData {
  name: string;
  description: string;
  nodes: number;
  vcpu_per_node: number;
  memory_gb_per_node: number;
  concurrent_users: number;
  rps_target: number;
  duration_seconds: number;
  ramp_up_seconds: number;
  scenario: string;
}

export default function NewSimulationPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<SimulationFormData>({
    name: "",
    description: "",
    nodes: 3,
    vcpu_per_node: 4,
    memory_gb_per_node: 8,
    concurrent_users: 1000,
    rps_target: 800,
    duration_seconds: 600,
    ramp_up_seconds: 60,
    scenario: "baseline",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");

  // Handle template selection
  const handleTemplateSelect = (templateId: string) => {
    const template = getTemplate(templateId);
    if (!template) return;

    setSelectedTemplate(templateId);
    setFormData({
      name: template.name,
      description: template.description,
      nodes: template.config.nodes,
      vcpu_per_node: template.config.resources.vcpu_per_node,
      memory_gb_per_node: template.config.resources.memory_gb_per_node,
      concurrent_users: template.config.workload.concurrent_users,
      rps_target: template.config.workload.rps_target || 0,
      duration_seconds: template.config.workload.duration_seconds,
      ramp_up_seconds: template.config.workload.ramp_up_seconds || 0,
      scenario: template.config.scenario || "baseline",
    });
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    
    // Define numeric fields - these should be converted to numbers
    const numericFields = [
      "nodes",
      "vcpu_per_node",
      "memory_gb_per_node",
      "concurrent_users",
      "rps_target",
      "duration_seconds",
      "ramp_up_seconds",
    ];
    
    // Text fields: "name", "description", "scenario" should remain strings
    setFormData((prev) => ({
      ...prev,
      [name]: numericFields.includes(name)
        ? Number(value) || 0
        : value,
    }));

    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }
    if (formData.nodes < 1) {
      newErrors.nodes = "At least 1 node is required";
    }
    if (formData.vcpu_per_node < 1) {
      newErrors.vcpu_per_node = "At least 1 vCPU is required";
    }
    if (formData.memory_gb_per_node < 1) {
      newErrors.memory_gb_per_node = "At least 1 GB memory is required";
    }
    if (formData.concurrent_users < 1) {
      newErrors.concurrent_users = "At least 1 concurrent user is required";
    }
    if (formData.duration_seconds < 60) {
      newErrors.duration_seconds = "Duration must be at least 60 seconds";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Get scenario YAML from template if one was selected
      const template = selectedTemplate ? getTemplate(selectedTemplate) : null;
      const scenarioYaml = template?.scenarioYaml;
      
      // Create simulation run (uses API client which will call backend when available)
      const simulationRun = await createSimulationRun({
        name: formData.name,
        config: {
          nodes: formData.nodes,
          workload: {
            concurrent_users: formData.concurrent_users,
            rps_target: formData.rps_target,
            duration_seconds: formData.duration_seconds,
            ramp_up_seconds: formData.ramp_up_seconds,
          },
          resources: {
            vcpu_per_node: formData.vcpu_per_node,
            memory_gb_per_node: formData.memory_gb_per_node,
          },
          scenario: formData.scenario,
          description: formData.description || undefined,
        },
      }, scenarioYaml);

      // Optionally start the simulation immediately
      // await startSimulationRun(simulationRun.id);

      // Redirect to simulator dashboard or to the detail page
      router.push(`/simulator/${simulationRun.id}`);
    } catch (error) {
      console.error("Error creating simulation:", error);
      setErrors({
        general:
          error instanceof Error
            ? error.message
            : "Failed to create simulation. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/simulator"
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">New Simulation</h1>
          <p className="text-sm text-white/60 mt-1">
            Configure and start a new simulation run
          </p>
        </div>
      </div>

      {/* Template Selector */}
      <div className="bg-card rounded-lg p-6 border border-border">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Quick Start Templates
        </h2>
        <p className="text-sm text-white/60 mb-4">
          Select a pre-configured template to get started quickly, or configure manually below.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {SIMULATION_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => handleTemplateSelect(template.id)}
              className={`p-4 rounded-lg border text-left transition-colors ${
                selectedTemplate === template.id
                  ? "border-white/40 bg-white/10"
                  : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20"
              }`}
            >
              <h3 className="font-semibold text-white mb-1">{template.name}</h3>
              <p className="text-xs text-white/60">{template.description}</p>
              {selectedTemplate === template.id && (
                <div className="mt-2 text-xs text-green-400">✓ Selected</div>
              )}
            </button>
          ))}
        </div>
        {selectedTemplate && (
          <button
            type="button"
            onClick={() => {
              setSelectedTemplate("");
              setFormData({
                name: "",
                description: "",
                nodes: 3,
                vcpu_per_node: 4,
                memory_gb_per_node: 8,
                concurrent_users: 1000,
                rps_target: 800,
                duration_seconds: 600,
                ramp_up_seconds: 60,
                scenario: "baseline",
              });
            }}
            className="mt-4 text-sm text-white/60 hover:text-white underline"
          >
            Clear template and start from scratch
          </button>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-card rounded-lg p-6 border border-border space-y-6">
          {/* Basic Info */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Basic Information</h2>
            <div className="space-y-4">
              <InputField
                name="name"
                type="text"
                label="Simulation Name"
                placeholder="e.g., High Load Test - 2000 Users"
                value={formData.name}
                onChange={handleChange}
                error={errors.name}
                required
              />
              <TextAreaField
                name="description"
                label="Description (optional)"
                placeholder="Describe the purpose of this simulation..."
                value={formData.description}
                onChange={handleChange}
                rows={3}
                required={false}
              />
            </div>
          </div>

          {/* Infrastructure Configuration */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Infrastructure</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <InputField
                name="nodes"
                type="number"
                label="Number of Nodes"
                value={formData.nodes.toString()}
                onChange={handleChange}
                error={errors.nodes}
                required
                min={1}
              />
              <InputField
                name="vcpu_per_node"
                type="number"
                label="vCPU per Node"
                value={formData.vcpu_per_node.toString()}
                onChange={handleChange}
                error={errors.vcpu_per_node}
                required
                min={1}
              />
              <InputField
                name="memory_gb_per_node"
                type="number"
                label="Memory (GB) per Node"
                value={formData.memory_gb_per_node.toString()}
                onChange={handleChange}
                error={errors.memory_gb_per_node}
                required
                min={1}
              />
            </div>
          </div>

          {/* Workload Configuration */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Workload</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputField
                name="concurrent_users"
                type="number"
                label="Concurrent Users"
                value={formData.concurrent_users.toString()}
                onChange={handleChange}
                error={errors.concurrent_users}
                required
                min={1}
              />
              <InputField
                name="rps_target"
                type="number"
                label="Target RPS (Requests Per Second)"
                value={formData.rps_target.toString()}
                onChange={handleChange}
                required
                min={1}
              />
            </div>
          </div>

          {/* Simulation Settings */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Simulation Settings</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <InputField
                name="duration_seconds"
                type="number"
                label="Duration (seconds)"
                value={formData.duration_seconds.toString()}
                onChange={handleChange}
                error={errors.duration_seconds}
                required
                min={60}
              />
              <InputField
                name="ramp_up_seconds"
                type="number"
                label="Ramp Up (seconds)"
                value={formData.ramp_up_seconds.toString()}
                onChange={handleChange}
                required
                min={0}
              />
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Scenario
                </label>
                <select
                  name="scenario"
                  value={formData.scenario}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-white/20"
                >
                  <option value="baseline">Baseline</option>
                  <option value="high_load">High Load</option>
                  <option value="stress_test">Stress Test</option>
                  <option value="spike_test">Spike Test</option>
                  <option value="endurance">Endurance</option>
                </select>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {errors.general && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-sm text-red-400">{errors.general}</p>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex items-center justify-end gap-4 pt-4 border-t border-border">
            <Link
              href="/simulator"
              className="px-4 py-2 text-white/80 hover:text-white transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-6 py-2 bg-white text-black rounded-lg hover:bg-white/90 transition-colors font-medium disabled:bg-white/50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Start Simulation
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

