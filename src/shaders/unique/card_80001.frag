#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0 - smoothstep(0.55, 1.0, length((p-c)/r));
}

void main() {
    vec2 p = vec2(v_uv.x, 1.0-v_uv.y);
    vec4 scan = texture2D(u_card, v_uv);
    float aa = max(1.0/max(u_resolution.x,1.0),1.0/max(u_resolution.y,1.0));
    float t = max(u_time,0.0);
    float seed = fract(u_seed*0.173)*6.283185;
    // The three shields and branches start below .55; the title ends at .14.
    float art = smoothstep(.140,.157,p.y)*(1.0-smoothstep(.539,.551,p.y));
    art *= smoothstep(.012,.033,p.x)*(1.0-smoothstep(.967,.988,p.x));

    // Wind bends the painted palm crowns; the trunks and traveller stay put.
    float crowns = oval(p,vec2(.479,.230),vec2(.150,.087));
    crowns += oval(p,vec2(.590,.297),vec2(.083,.049));
    crowns = min(crowns,1.0);
    vec2 drift = vec2(.0065*sin(t*1.65+p.y*16.0+seed),
                      .0016*sin(t*1.1+p.x*20.0+seed))*crowns;
    // Heat shimmer is confined to the bright distant sand around the oasis.
    float heat = oval(p,vec2(.505,.437),vec2(.335,.065));
    drift.x += .0025*sin(p.y*180.0-t*3.2+seed)*heat;
    vec3 color = texture2D(u_card,v_uv+vec2(drift.x,-drift.y)*art).rgb;

    // Long, visible sand streamers follow the dunes into the palm sanctuary.
    // Their advancing heads and fading tails read even at compact card size.
    float sand = 0.0;
    for (int i=0; i<7; i++) {
        float k = float(i);
        float head = fract(t*(.145+k*.008)+k*.157+seed*.04);
        float x = .04+.94*head;
        float path = .471+k*.010 + .017*sin(p.x*7.5+k*.77-t*.7+seed);
        float tail = smoothstep(x-.24,x-.05,p.x)*(1.0-smoothstep(x,x+.025,p.x));
        float line = 1.0-smoothstep(.0010,.0024+aa*.6,abs(p.y-path));
        float fade = smoothstep(.0,.11,head)*(1.0-smoothstep(.88,1.0,head));
        sand += line*tail*fade;
    }
    // Keep the visible pilgrim's head and cloak legible.
    float pilgrim = oval(p,vec2(.335,.534),vec2(.048,.051));
    sand *= 1.0-pilgrim;
    color = mix(color,vec3(.72,.39,.09),min(sand*.18,.30));
    color += vec3(.34,.24,.065)*sand;

    // Sagyrma grants zeal: successive amber pulses run up the painted path
    // from the pilgrim to the life-giving oasis, like an invitation to advance.
    float approach = clamp((.529-p.y)/.100,0.0,1.0);
    float routeX = mix(.347,.494,approach)+.019*sin(approach*3.141593);
    float route = exp(-pow((p.x-routeX)/.028,2.0));
    route *= smoothstep(.426,.442,p.y)*(1.0-smoothstep(.513,.532,p.y));
    float stride = pow(.5+.5*cos(approach*17.0-t*4.5+seed),7.0);
    color += vec3(.24,.19,.025)*route*stride*(1.0-pilgrim);

    // Small golden grains rise from the oasis and travel with the desert wind.
    float grains = 0.0;
    for (int i=0; i<18; i++) {
        float k = float(i);
        float age = fract(k*.618034+t*.19+seed*.03);
        vec2 c = vec2(.22+.57*fract(k*.381966+age*.25),
                      .466-age*.085+.013*sin(k*2.3+age*7.0));
        float d = length((p-c)*vec2(1.0,1.4113));
        grains += (1.0-smoothstep(.0012,.0032+aa*.55,d))*sin(age*3.141593);
    }
    color += vec3(.48,.33,.095)*grains;

    if (u_is_foil) {
        // Metallic sunset bands remain visible at time zero, with deep teal
        // in the sky and copper/gold on the dunes instead of a white wash.
        float phase = p.x*1.25+p.y*1.8-t*.10+seed*.08;
        vec3 hue = .5+.5*cos(6.283185*(phase+vec3(.0,.33,.67)));
        vec3 metal = mix(2.0*color*hue,
                         1.0-2.0*(1.0-color)*(1.0-hue),step(vec3(.5),color));
        float sunset = smoothstep(.27,.38,p.y);
        float foilAmount = mix(.28,.48,sunset);
        color = mix(color,metal,foilAmount);
        float band = pow(.5+.5*sin(p.x*14.0+p.y*19.0-t*1.8+seed),14.0);
        color += (1.0-color)*(vec3(.16,.10,.025)+hue*.27)*band*(.45+.55*sunset);
        color += vec3(.12,.19,.13)*grains;
    }
    gl_FragColor = vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
