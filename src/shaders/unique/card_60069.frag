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

// Krom gathers the formations of the dwarves beside him: their weapons
// answer in sequence, then the signal climbs his actual steel pauldrons.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.55,1.0,length((p-c)/r));
}
float line(vec2 p, vec2 a, vec2 b) {
    vec2 q=(p-a)*vec2(1.0,1.41129);
    vec2 v=(b-a)*vec2(1.0,1.41129);
    return length(q-v*clamp(dot(q,v)/dot(v,v),0.0,1.0));
}
float pulse(float phase, float offset) {
    return pow(0.5+0.5*cos(6.2831853*(phase-offset)),8.0);
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 original=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.41129/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.137);
    float phase=t*0.23+seed*0.18;
    float art=smoothstep(0.139,0.149,p.y)*(1.0-smoothstep(0.549,0.560,p.y));
    art*=smoothstep(0.008,0.020,p.x)*(1.0-smoothstep(0.980,0.992,p.x));
    // Both shield badges and their attached numerals stay pixel-identical.
    art*=clamp(smoothstep(0.183,0.201,p.x)+smoothstep(0.308,0.322,p.y),0.0,1.0);
    vec3 color=original.rgb;
    float lum=dot(original.rgb,vec3(0.2126,0.7152,0.0722));
    float silver=1.0-smoothstep(0.065,0.21,abs(original.r-original.b));
    silver*=smoothstep(0.07,0.29,lum);
    float face=oval(p,vec2(0.537,0.282),vec2(0.093,0.095));
    float beard=oval(p,vec2(0.548,0.343),vec2(0.076,0.102));
    float skin=clamp(face+beard,0.0,1.0);
    float leftPlate=oval(p,vec2(0.392,0.299),vec2(0.115,0.071));
    float rightPlate=oval(p,vec2(0.667,0.282),vec2(0.109,0.057));
    float leftGlove=oval(p,vec2(0.470,0.359),vec2(0.062,0.043));
    float rightGlove=oval(p,vec2(0.716,0.389),vec2(0.061,0.056));
    float axe=oval(p,vec2(0.697,0.443),vec2(0.128,0.076));
    float armor=clamp(leftPlate+rightPlate+leftGlove+rightGlove+axe,0.0,1.0)*(1.0-skin);
    float commander=pulse(phase,0.44);
    float leftAnswer=pulse(phase,0.0);
    float rightAnswer=pulse(phase,0.20);

    // Cold reflected light follows the embossed armor, without moving the scan.
    float broad=0.5+0.5*cos(p.y*47.0-p.x*12.0-t*2.2);
    color+=vec3(0.065,0.15,0.21)*armor*silver*(0.45+0.55*broad+commander*0.8);
    float leftSoldier=oval(p,vec2(0.261,0.467),vec2(0.150,0.104));
    float rightSoldier=oval(p,vec2(0.915,0.398),vec2(0.069,0.076));
    color+=vec3(0.10,0.18,0.23)*silver*(leftSoldier*(0.20+leftAnswer)+rightSoldier*(0.20+rightAnswer));

    // Trace the painted edges of Krom's layered right shoulder and axe blade.
    float seams=0.0;
    for (int i=0;i<3;i++) {
        float fi=float(i);
        float d=line(p,vec2(0.606+fi*0.006,0.283+fi*0.009),
                       vec2(0.699+fi*0.014,0.264+fi*0.023));
        float core=1.0-smoothstep(0.0012,0.0030+aa,d);
        float glow=exp(-d*d/0.00012);
        float activation=0.28+0.72*pulse(phase,0.38+fi*0.055);
        seams+=(core*0.75+glow*0.19)*activation;
    }
    color+=vec3(0.30,0.51,0.62)*seams*(1.0-skin);
    float bladeDistance=min(line(p,vec2(0.633,0.375),vec2(0.603,0.416)),
                            line(p,vec2(0.603,0.416),vec2(0.627,0.480)));
    bladeDistance=min(bladeDistance,line(p,vec2(0.744,0.488),vec2(0.796,0.432)));
    float bladeEdge=1.0-smoothstep(0.0015,0.0035+aa,bladeDistance);
    color+=vec3(0.38,0.60,0.71)*bladeEdge*(0.30+0.70*commander);

    // The left dwarf's horizontal hammer and the right dwarf's upright blade
    // answer the leader, like successive ranks receiving an order.
    float hammer=line(p,vec2(0.031,0.433),vec2(0.224,0.394));
    float sword=line(p,vec2(0.921,0.350),vec2(0.951,0.260));
    float signalLeft=exp(-hammer*hammer/0.00019);
    float signalRight=exp(-sword*sword/0.00012);
    color+=vec3(0.14,0.32,0.40)*(signalLeft*(0.23+leftAnswer)+signalRight*(0.23+rightAnswer));

    // His two real beard clasps and the central belt catch a warm command beat.
    float clasps=oval(p,vec2(0.503,0.403),vec2(0.017,0.022))
                +oval(p,vec2(0.572,0.400),vec2(0.017,0.023));
    float belt=oval(p,vec2(0.548,0.447),vec2(0.028,0.020));
    color+=vec3(0.27,0.14,0.020)*(clasps+belt)*(0.42+0.58*commander);

    if (u_is_foil) {
        // Broad foil facets remain visible at rest; the armor has a stronger
        // traveling metallic reflection than the distant frozen battlefield.
        float foilPhase=p.x*1.8+p.y*2.7-t*0.12+seed*0.27;
        vec3 spectrum=0.5+0.5*cos(6.2831853*(foilPhase+vec3(0.0,0.333,0.667)));
        vec3 coated=mix(2.0*color*spectrum,
                        1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        float substrate=(0.21+0.20*armor*silver)*(1.0-skin*0.96);
        color=mix(color,coated,substrate);
        float sheen=pow(0.5+0.5*sin(p.x*15.0-p.y*22.0+t*1.3+seed),7.0);
        float metal=clamp(armor*silver+leftSoldier*silver*0.6+rightSoldier*silver*0.7,0.0,1.0);
        color+=(1.0-color)*mix(vec3(0.68,0.83,0.92),spectrum,0.56)
               *metal*(0.22+0.58*sheen);
        color+=(1.0-color)*spectrum*0.07*(1.0-skin);
        color+=(1.0-color)*vec3(0.88,0.65,0.21)*(clasps+belt)*(0.25+0.45*sheen);
    }
    gl_FragColor=vec4(mix(original.rgb,clamp(color,0.0,1.0),art),original.a);
}
