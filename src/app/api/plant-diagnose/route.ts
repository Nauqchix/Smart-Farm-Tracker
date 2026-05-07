import { NextRequest, NextResponse } from "next/server";

const AI_SERVICE_URL =
  process.env.PLANT_AI_URL || "http://127.0.0.1:8001/predict";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    // Frontend sends image using field name "photo"
    const file = formData.get("photo") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No image uploaded. Please select a photo." },
        { status: 400 },
      );
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Uploaded file must be an image (PNG, JPG, or WEBP)." },
        { status: 400 },
      );
    }

    // FastAPI expects the field name "file"
    const aiFormData = new FormData();
    aiFormData.append("file", file);

    let aiResponse: Response;
    try {
      aiResponse = await fetch(AI_SERVICE_URL, {
        method: "POST",
        body: aiFormData,
      });
    } catch {
      console.error("[PLANT_DIAGNOSE] AI service unreachable at", AI_SERVICE_URL);
      return NextResponse.json(
        {
          error:
            "AI service is not available. Please make sure the plant disease AI server is running.",
        },
        { status: 503 },
      );
    }

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("[PLANT_DIAGNOSE] AI service error:", errorText);
      return NextResponse.json(
        { error: "AI service returned an error. Please try again." },
        { status: 502 },
      );
    }

    const aiResult = await aiResponse.json();

    // Optional: persist to database (uncomment when PlantDiagnosis model is migrated)
    // try {
    //   const { prisma } = await import("@/lib/prisma");
    //   await (prisma as any).plantDiagnosis?.create({
    //     data: {
    //       rawLabel: aiResult.rawLabel,
    //       label: aiResult.label,
    //       disease: aiResult.disease ?? null,
    //       plant: aiResult.plant,
    //       confidence: aiResult.confidence,
    //       status: aiResult.status,
    //       suggestion: aiResult.suggestion ?? null,
    //     },
    //   });
    // } catch (dbErr) {
    //   console.warn("[PLANT_DIAGNOSE] DB save skipped:", dbErr);
    // }

    return NextResponse.json({
      message: "Plant diagnosis completed",
      data: aiResult,
    });
  } catch (error) {
    console.error("[PLANT_DIAGNOSE_ERROR]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
