import logger from '@adonisjs/core/services/logger'
import Lastupdate from "#models/lastupdate";
import { HttpContext } from "@adonisjs/core/http"
import { DateTime } from "luxon";
import { parseUtcOffsetMinutes } from '../helpers/date_helper.js';

export default class LastUpdatesController {
  public async listAfterDate({ request, params, auth, response } : HttpContext ) {
    try {

        const user = await auth.getUserOrFail()

        const dateParam = params.date
        const rawDate = DateTime.fromFormat(dateParam, 'yyyy-MM-ddHH:mm:ss')

        logger.info(`listAfterDate: ${dateParam}`)

        if (!rawDate.isValid) {
            return response.badRequest({
                error: 'Formato de data inválido. Use o formato yyyy-MM-ddHH:mm:ss',
            })
        }

        const utcParam = params.utc ?? request.input('utc')
        const offsetMinutes = parseUtcOffsetMinutes(utcParam)

        if (offsetMinutes === null) {
            return response.badRequest({
                error: 'Formato de UTC inválido. Envie o GMT como número (ex: -3, 3) ou offset (ex: -03:00, +02:00)',
            })
        }

        // Converte do GMT atual do dispositivo para GMT 0 (UTC 0)
        const parsedDate = rawDate.minus({ minutes: offsetMinutes })

        const registros = await Lastupdate.query()
            .where('date_update', '>', parsedDate.toSQL())
            .where('user', user.id)
            .orderBy('date_update', 'asc')

        return response.json(registros)

    } catch (error) {
        return response.internalServerError({ error: 'Erro ao buscar registros'})
    }
  }
}