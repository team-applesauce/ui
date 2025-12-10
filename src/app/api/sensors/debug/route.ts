import { NextResponse } from 'next/server';
import { getCloudantClient, getDatabaseName } from '@/lib/cloudant';

export async function GET() {
  try {
    const client = getCloudantClient();
    const dbName = getDatabaseName();

    // Fetch a few documents to see the actual structure
    const response = await client.postAllDocs({
      db: dbName,
      includeDocs: true,
      limit: 5,
    });

    const docs = response.result.rows
      .filter((row) => row.doc)
      .map((row) => row.doc);

    return NextResponse.json({
      success: true,
      database: dbName,
      documentCount: docs.length,
      sampleDocuments: docs,
    });
  } catch (error) {
    console.error('Error fetching debug data:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

