import { NextResponse } from "next/server";
import { getIconsDir } from "@/lib/paths";
import { readdirSync } from "fs";

// GET - list all custom icons
export async function GET() {
  try {
    const iconsDir = getIconsDir();
    const files = readdirSync(iconsDir);
    
    // Filter to only include image files
    const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];
    const icons = files.filter(file => 
      imageExtensions.some(ext => file.toLowerCase().endsWith(ext))
    );
    
    return NextResponse.json({ icons });
  } catch (error) {
    console.error("Failed to list icons:", error);
    return NextResponse.json({ icons: [] });
  }
}
