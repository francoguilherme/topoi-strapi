/**
 * artigo controller
 */

import { factories } from '@strapi/strapi'
import path from 'path';
import fs from 'fs/promises';

export default factories.createCoreController('api::artigo.artigo', ({ strapi }) => ({
    async generateXML(ctx) {
        const artigos = await strapi.entityService.findMany('api::artigo.artigo', {
            limit: 10,
            populate: ['arquivo'],
        });

        if (artigos && Array.isArray(artigos)) {
            const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
            for (const artigo of artigos as any[]) {
                console.log(`\nProcessando artigo: ${artigo.titulo}`);
                
                if (artigo.arquivo && artigo.arquivo.url) {
                    try {
                        const fileUrl = artigo.arquivo.url;
                        const filePath = path.join(process.cwd(), 'public', fileUrl);
                        
                        console.log(`Lendo arquivo: ${filePath}`);
                        const fileBuffer = await fs.readFile(filePath);
                        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(fileBuffer) });
                        const pdfDocument = await loadingTask.promise;
                        
                        let fullText = '';
                        for (let i = 1; i <= pdfDocument.numPages; i++) {
                            const page = await pdfDocument.getPage(i);
                            const textContent = await page.getTextContent();
                            const pageText = textContent.items.map((item: any) => item.str).join(' ');
                            fullText += pageText + '\n';
                        }
                        
                        const tmpPath = path.join(process.cwd(), '.tmp', `artigo_${artigo.id}_text.txt`);
                        await fs.writeFile(tmpPath, fullText, 'utf8');
                        console.log(`Texto extraido e salvo em: ${tmpPath}`);
                    } catch (error) {
                        console.error(`Erro ao extrair PDF do artigo ${artigo.titulo}:`, error);
                    }
                } else {
                    console.log(`Artigo "${artigo.titulo}" não possui arquivo.`);
                }
            }
        }

        ctx.body = { message: 'Extração e geração engatilhados, cheque o console.' };
    }
}));
