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

// Око Сота: the jade eye charges the golden serpents and releases its bolt.
// Two returning emerald satellites represent its two gifts of incarnation.
float softDisc(vec2 p, vec2 c, vec2 r) {
    return 1.0 - smoothstep(0.25, 1.0, length((p-c)/r));
}
float lineDistance(vec2 p, vec2 a, vec2 b) {
    vec2 d = b-a;
    return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.0,1.0));
}
float lightning(vec2 p, vec2 a, vec2 b, float aa) {
    float d = lineDistance(p,a,b);
    return 1.0-smoothstep(0.0013,0.003+aa,d)
         + 0.24*exp(-d/0.010);
}

void main() {
    vec2 p = vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan = texture2D(u_card,v_uv);
    float aa = max(1.0/u_resolution.x,1.0/u_resolution.y);
    float t = max(u_time,0.0);
    float seed = fract(u_seed*0.173)*6.2831853;
    // Borders end before the lower ropes and shields. Top badges are outside.
    float art = smoothstep(0.139,0.154,p.y)
              * (1.0-smoothstep(0.535,0.548,p.y))
              * smoothstep(0.015,0.038,p.x)
              * (1.0-smoothstep(0.962,0.985,p.x));
    vec3 color = scan.rgb;
    vec2 eye = vec2(0.439,0.274);
    vec2 q = (p-eye)/vec2(0.127,0.107);
    float r = length(q);
    float angle = atan(q.y,q.x);
    float charge = 0.5+0.5*sin(t*2.2+seed);
    float jade = 1.0-smoothstep(0.72,1.04,r);
    float pupil = softDisc(p,vec2(0.433,0.294),vec2(0.017,0.049));
    // Light turns across the crystal facets without moving the printed pupil.
    float sweep = pow(0.5+0.5*cos(angle-t*1.7+seed),6.0);
    color += vec3(0.025,0.31,0.15)*jade*(0.20+0.75*sweep)*(1.0-pupil);
    float rim = exp(-abs(r-1.0)/0.055);
    color += vec3(0.18,0.68,0.36)*rim*(0.25+0.65*sweep);

    // A visibly expanding halo issues from the eye. Its outer edge dissolves.
    float wave = fract(t*0.47+seed*0.07);
    float waveRadius = 0.86+wave*0.78;
    float halo = exp(-abs(r-waveRadius)/(0.025+aa*5.0));
    halo *= sin(wave*3.14159265)*0.65;
    color += vec3(0.08,0.56,0.30)*halo;

    // Two bright motes orbit the eye with broad, tapering trails, easily read
    // at collection scale. The routes sit between the crystal and snake heads.
    for (int i=0;i<2;i++) {
        float a = t*1.55+float(i)*3.14159265+seed;
        vec2 c = eye+vec2(cos(a)*0.148,sin(a)*0.121);
        float dotGlow = softDisc(p,c,vec2(0.015,0.010));
        float tailAngle = mod(a-angle+6.2831853,6.2831853);
        float trail = exp(-tailAngle*3.2)*exp(-abs(r-1.15)/0.055);
        color += vec3(0.28,0.82,0.47)*(dotGlow*0.95+trail*0.75);
    }

    // The printed golden coils conduct the gift down from the snake's mouth.
    float gold = smoothstep(0.09,0.30,scan.r-scan.b)
               * smoothstep(0.22,0.48,scan.g);
    float snakes = softDisc(p,vec2(0.674,0.385),vec2(0.142,0.133))
                 + softDisc(p,vec2(0.259,0.392),vec2(0.203,0.127))
                 + softDisc(p,vec2(0.626,0.222),vec2(0.095,0.061));
    float current = pow(0.5+0.5*sin(p.y*69.0-p.x*19.0-t*4.5+seed),7.0);
    color += vec3(0.36,0.23,0.035)*gold*min(snakes,1.0)*current;

    // The discharge leaves the gem's right tip and zigzags into the chamber.
    // A head of light travels the complete route; its fading tail follows it.
    float travel = fract(t*0.32+seed*0.05);
    float headX = mix(0.55,0.92,travel);
    float bolt = lightning(p,vec2(0.549,0.274),vec2(0.651,0.300),aa);
    bolt += lightning(p,vec2(0.651,0.300),vec2(0.627,0.329),aa);
    bolt += lightning(p,vec2(0.627,0.329),vec2(0.751,0.352),aa);
    bolt += lightning(p,vec2(0.751,0.352),vec2(0.728,0.386),aa);
    bolt += lightning(p,vec2(0.728,0.386),vec2(0.909,0.422),aa);
    float front = exp(-pow((p.x-headX)/0.055,2.0));
    float tail = smoothstep(headX-0.16,headX-0.03,p.x)
               * (1.0-smoothstep(headX,headX+0.025,p.x));
    float visibility = smoothstep(0.0,0.06,travel)
                     * (1.0-smoothstep(0.88,1.0,travel));
    color += vec3(0.22,0.72,0.49)*bolt*(front*0.75+tail*0.35)*visibility;
    color += vec3(0.04,0.17,0.075)*jade*charge;

    if (u_is_foil) {
        // Strong jade / bronze interference follows gem facets and snake gold,
        // retaining the dark engraved lines and staying visible when t is zero.
        float phase = p.x*1.4+p.y*2.7+r*0.21-t*0.10+seed*0.08;
        vec3 rainbow = 0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        float material = 0.30+0.23*gold+0.12*jade;
        vec3 metallic = mix(2.0*color*rainbow,
            1.0-2.0*(1.0-color)*(1.0-rainbow),step(vec3(0.5),color));
        color = mix(color,metallic,material);
        float glint = pow(0.5+0.5*sin(p.x*24.0+p.y*29.0-t*1.3+seed),12.0);
        color += (vec3(0.12,0.14,0.045)+rainbow*0.16)*glint
               * (gold*min(snakes,1.0)+jade*0.7)*(1.0-pupil);
    }
    gl_FragColor = vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
